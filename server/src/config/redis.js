import IORedis from 'ioredis';
import { env } from './env.js';

// BullMQ requires maxRetriesPerRequest: null on every connection it uses.
export const createRedis = () => new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
