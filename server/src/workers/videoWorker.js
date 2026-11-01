import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { createRedis } from '../config/redis.js';
import { VIDEO_QUEUE } from '../queues/videoQueue.js';
import Lesson from '../models/Lesson.js';
import { probe, transcodeToHls, makeThumbnail } from '../services/ffmpeg.js';
import * as storage from '../services/storage.js';
import { refreshCourseStats } from '../services/courseStats.js';

/**
 * Pipeline for one upload:
 *   raw object -> download -> ffprobe -> FFmpeg HLS ladder (+thumbnail) -> upload hls/<lesson>/<version>/ -> mark ready
 * Runs in its own process (npm run worker) so CPU-heavy encoding never blocks the API.
 */
async function processVideo(job) {
  const { lessonId, rawKey } = job.data;
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) return { skipped: 'lesson deleted' };
  // A newer upload superseded this job
  if (lesson.video.originalKey !== rawKey) return { skipped: 'superseded' };

  const work = path.join(env.storage.tmpDir, 'work', `${lessonId}-${job.id}`);
  const inputFile = path.join(work, `input${path.extname(rawKey) || '.mp4'}`);
  const outDir = path.join(work, 'hls');
  const oldHlsKey = lesson.video.hlsKey;

  try {
    await Lesson.updateOne({ _id: lessonId }, { 'video.status': 'processing', 'video.progress': 0, 'video.error': null });
    await storage.downloadToFile(rawKey, inputFile);

    const info = await probe(inputFile);
    let lastReported = 0;
    const renditions = await transcodeToHls(inputFile, outDir, info, async (pct) => {
      if (pct - lastReported >= 5) {
        lastReported = pct;
        await job.updateProgress(pct);
        await Lesson.updateOne({ _id: lessonId }, { 'video.progress': pct });
      }
    });
    await makeThumbnail(inputFile, path.join(outDir, 'thumb.jpg'), info.durationSec).catch(() => {});

    const version = Date.now();
    const prefix = `hls/${lessonId}/${version}`;
    await storage.putDir(outDir, prefix);

    await Lesson.updateOne(
      { _id: lessonId },
      {
        'video.status': 'ready',
        'video.progress': 100,
        'video.hlsKey': `${prefix}/master.m3u8`,
        'video.thumbnailKey': `${prefix}/thumb.jpg`,
        'video.durationSec': info.durationSec,
        'video.renditions': renditions.map((r) => ({ name: r.name, height: r.height, videoKbps: r.videoKbps })),
        'video.processedAt': new Date(),
        'video.error': null,
      }
    );
    await refreshCourseStats(lesson.course);

    // Cleanup: previous HLS version (if the video was replaced) and the raw upload
    if (oldHlsKey) await storage.deletePrefix(path.posix.dirname(oldHlsKey)).catch(() => {});
    if (!env.storage.keepRaw) await storage.deleteKey(rawKey).catch(() => {});
    return { durationSec: info.durationSec, renditions: renditions.map((r) => r.name) };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function main() {
  await connectDb();
  await fs.mkdir(env.storage.tmpDir, { recursive: true });

  const worker = new Worker(VIDEO_QUEUE, processVideo, {
    connection: createRedis(),
    concurrency: env.ffmpeg.concurrency,
    lockDuration: 5 * 60_000, // long encodes: renew lock every few minutes
  });

  worker.on('completed', (job, result) => console.log(`[worker] ✓ ${job.id}`, result));
  worker.on('failed', async (job, err) => {
    console.error(`[worker] ✗ ${job?.id} (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message.split('\n')[0]}`);
    // Only surface "failed" to the instructor once BullMQ has given up retrying
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
      await Lesson.updateOne(
        { _id: job.data.lessonId, 'video.originalKey': job.data.rawKey },
        { 'video.status': 'failed', 'video.error': err.message.split('\n')[0].slice(0, 300) }
      );
    }
  });
  worker.on('error', (err) => console.error('[worker] error', err.message));

  const shutdown = async () => {
    console.log('[worker] shutting down…');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`[worker] waiting for jobs on "${VIDEO_QUEUE}" (concurrency ${env.ffmpeg.concurrency})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
