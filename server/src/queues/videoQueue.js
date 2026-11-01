import { Queue } from 'bullmq';
import { createRedis } from '../config/redis.js';

export const VIDEO_QUEUE = 'video-processing';

let queue;
const getQueue = () =>
  (queue ??= new Queue(VIDEO_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600, count: 200 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  }));

/** Hand a freshly uploaded video to the FFmpeg worker. jobId is unique per upload (keyed by raw object). */
export async function enqueueVideo({ lessonId, rawKey }) {
  return getQueue().add('transcode', { lessonId, rawKey }, { jobId: `${lessonId}-${Date.now()}` });
}

export async function closeVideoQueue() {
  await queue?.close();
}
