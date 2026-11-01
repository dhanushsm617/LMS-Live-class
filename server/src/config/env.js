import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const flag = (v, d = false) =>
  v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const host = (v = '') => v.replace(/^https?:\/\//, '').replace(/\/+$/, '');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const livekitUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';

export const env = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lms',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieSecure: flag(process.env.COOKIE_SECURE, isProd),

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local', // 'local' | 's3'
    root: path.resolve(root, process.env.STORAGE_ROOT || 'storage'),
    tmpDir: path.resolve(root, process.env.TMP_DIR || 'tmp'),
    keepRaw: flag(process.env.KEEP_RAW_UPLOADS, false),
  },
  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    bucket: process.env.S3_BUCKET || '',
  },
  cloudfront: {
    domain: host(process.env.CLOUDFRONT_DOMAIN),
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID || '',
    privateKey: (process.env.CLOUDFRONT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    cookieDomain: process.env.CLOUDFRONT_COOKIE_DOMAIN || '', // e.g. .example.com
    cookieTtlSec: Number(process.env.CLOUDFRONT_COOKIE_TTL_SEC || 4 * 3600),
  },

  ffmpeg: {
    bin: process.env.FFMPEG_PATH || 'ffmpeg',
    probe: process.env.FFPROBE_PATH || 'ffprobe',
    concurrency: Number(process.env.VIDEO_WORKER_CONCURRENCY || 1),
    segmentSeconds: 6,
  },

  payments: {
    mode: process.env.PAYMENT_MODE || (stripeSecretKey ? 'stripe' : 'mock'), // 'stripe' | 'mock'
    stripeSecretKey,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: (process.env.CURRENCY || 'inr').toLowerCase(),
    platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT || 20),
  },

  livekit: {
    url: livekitUrl, // server -> LiveKit (REST)
    publicUrl: process.env.LIVEKIT_PUBLIC_URL || livekitUrl, // browser -> LiveKit (WebRTC signalling)
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'secret',
  },

  limits: { maxVideoMb: Number(process.env.MAX_VIDEO_MB || 2048) },
};

if (isProd && env.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
if (env.storage.driver === 's3' && (!env.aws.bucket || !env.cloudfront.domain)) {
  throw new Error('S3_BUCKET and CLOUDFRONT_DOMAIN are required when STORAGE_DRIVER=s3');
}
