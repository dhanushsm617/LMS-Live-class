import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

// Adaptive bitrate ladder. Only rungs <= the source height are produced (no upscaling).
const LADDER = [
  { name: '360p', height: 360, videoKbps: 800, audioKbps: 96 },
  { name: '720p', height: 720, videoKbps: 2800, audioKbps: 128 },
  { name: '1080p', height: 1080, videoKbps: 5000, audioKbps: 192 },
];

export function pickRenditions(srcHeight) {
  const rungs = LADDER.filter((r) => r.height <= srcHeight);
  if (rungs.length) return rungs;
  // Tiny source: single rendition at native (even) height
  const h = Math.max(144, srcHeight - (srcHeight % 2));
  return [{ name: `${h}p`, height: h, videoKbps: 500, audioKbps: 96 }];
}

export function probe(input) {
  return new Promise((resolve, reject) => {
    const p = spawn(env.ffmpeg.probe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`ffprobe not available: ${e.message}`)));
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.trim() || code}`));
      const json = JSON.parse(out);
      const video = json.streams.find((s) => s.codec_type === 'video');
      if (!video) return reject(new Error('The uploaded file has no video stream'));
      resolve({
        durationSec: Math.round(Number(json.format.duration) || 0),
        width: video.width,
        height: video.height,
        hasAudio: json.streams.some((s) => s.codec_type === 'audio'),
      });
    });
  });
}

function run(args, { durationSec = 0, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(env.ffmpeg.bin, ['-hide_banner', '-nostdin', '-y', '-progress', 'pipe:1', '-nostats', ...args]);
    const tail = [];
    p.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
        if (m && durationSec && onProgress) onProgress(Math.min(99, Math.round((Number(m[1]) / 1e6 / durationSec) * 100)));
      }
    });
    p.stderr.on('data', (chunk) => {
      tail.push(...chunk.toString().split('\n').filter(Boolean));
      if (tail.length > 25) tail.splice(0, tail.length - 25);
    });
    p.on('error', (e) => reject(new Error(`ffmpeg not available: ${e.message}`)));
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}\n${tail.join('\n')}`))
    );
  });
}

/**
 * Transcode `input` into an HLS ladder inside `outDir`:
 *   master.m3u8, <rendition>/index.m3u8, <rendition>/seg_000.ts, ...
 */
export async function transcodeToHls(input, outDir, info, onProgress) {
  const renditions = pickRenditions(info.height);
  await Promise.all(renditions.map((r) => fs.mkdir(path.join(outDir, r.name), { recursive: true })));

  const n = renditions.length;
  const split = `[0:v]split=${n}${renditions.map((_, i) => `[v${i}]`).join('')}`;
  const scales = renditions.map((r, i) => `[v${i}]scale=-2:${r.height},format=yuv420p[v${i}o]`);
  const filter = [split, ...scales].join(';');

  const args = ['-i', input, '-filter_complex', filter];
  renditions.forEach((r, i) => {
    args.push(
      '-map', `[v${i}o]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, `${r.videoKbps}k`,
      `-maxrate:v:${i}`, `${Math.round(r.videoKbps * 1.07)}k`,
      `-bufsize:v:${i}`, `${Math.round(r.videoKbps * 1.5)}k`
    );
  });
  if (info.hasAudio) {
    renditions.forEach((r, i) => args.push('-map', '0:a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${r.audioKbps}k`, '-ar', '48000', '-ac', '2'));
  }
  const seg = env.ffmpeg.segmentSeconds;
  args.push(
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${seg})`,
    '-f', 'hls',
    '-hls_time', String(seg),
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts',
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', path.join(outDir, '%v', 'seg_%03d.ts'),
    '-var_stream_map',
    renditions.map((r, i) => `v:${i}${info.hasAudio ? `,a:${i}` : ''},name:${r.name}`).join(' '),
    path.join(outDir, '%v', 'index.m3u8')
  );

  await run(args, { durationSec: info.durationSec, onProgress });
  return renditions;
}

export async function makeThumbnail(input, outFile, durationSec) {
  const at = Math.min(2, Math.max(0, durationSec / 2));
  await run(['-ss', String(at), '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', outFile]);
}
