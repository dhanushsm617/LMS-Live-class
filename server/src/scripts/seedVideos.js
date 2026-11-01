/**
 * Generates a small synthetic test video with FFmpeg and pushes it through the real pipeline
 * (storage -> BullMQ -> worker -> HLS) for the first N lessons of every published course.
 *
 *   npm run seed:videos            # 3 lessons per course
 *   npm run seed:videos -- --limit=6
 *
 * Requires: MongoDB + Redis running and `npm run worker` started in another terminal.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import * as storage from '../services/storage.js';
import { enqueueVideo, closeVideoQueue } from '../queues/videoQueue.js';

const limit = Number((process.argv.find((a) => a.startsWith('--limit=')) || '--limit=3').split('=')[1]);

function makeSample(file) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '24', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
    ];
    const p = spawn(env.ffmpeg.bin, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${c}`))));
  });
}

async function main() {
  await connectDb();
  await fs.mkdir(env.storage.tmpDir, { recursive: true });
  const sample = path.join(env.storage.tmpDir, 'sample.mp4');
  await makeSample(sample);

  const courses = await Course.find({ status: 'published' });
  let queued = 0;
  for (const course of courses) {
    const lessons = await Lesson.find({ course: course._id, 'video.status': 'none' }).sort('order').limit(limit);
    for (const lesson of lessons) {
      const rawKey = `raw/${lesson._id}/${Date.now()}.mp4`;
      await storage.putFile(sample, rawKey, { contentType: 'video/mp4' });
      lesson.video.status = 'queued';
      lesson.video.originalKey = rawKey;
      await lesson.save();
      await enqueueVideo({ lessonId: String(lesson._id), rawKey });
      queued++;
    }
  }
  console.log(`Queued ${queued} lesson videos. Watch the worker terminal for progress.`);
  await closeVideoQueue();
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
