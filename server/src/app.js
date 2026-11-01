import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { errorHandler, notFound } from './utils/errors.js';
import authRoutes from './routes/auth.routes.js';
import courseRoutes from './routes/courses.routes.js';
import lessonRoutes from './routes/lessons.routes.js';
import enrollmentRoutes from './routes/enrollments.routes.js';
import quizRoutes from './routes/quizzes.routes.js';
import paymentRoutes, { stripeWebhook } from './routes/payments.routes.js';
import instructorRoutes from './routes/instructor.routes.js';
import adminRoutes from './routes/admin.routes.js';
import liveRoutes from './routes/live.routes.js';
import certificateRoutes from './routes/certificates.routes.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl, credentials: true }));
if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Stripe needs the *raw* body to verify its signature, so this must come before express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: env.isProd ? 300 : 3000, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: env.storage.driver, payments: env.payments.mode }));

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api', quizRoutes); // /courses/:id/quizzes, /quizzes/:id/...
app.use('/api', liveRoutes); // /courses/:id/live, /live/:id/...

/**
 * Local-driver media server (development). In production the S3 driver is used and
 * CloudFront serves the HLS files – this route is never hit.
 * Only files under hls/<lessonId>/ are served, and only with a valid lms_media cookie for that lesson.
 */
if (env.storage.driver === 'local') {
  app.use(
    '/media',
    (req, res, next) => {
      const m = req.path.match(/^\/hls\/([a-f\d]{24})\//i);
      try {
        const { lesson } = jwt.verify(req.cookies?.lms_media || '', env.jwtSecret);
        if (m && lesson === m[1]) return next();
      } catch {
        /* fall through */
      }
      res.status(403).json({ message: 'Forbidden' });
    },
    express.static(env.storage.root, { index: false, dotfiles: 'deny', maxAge: '1h' })
  );
}

app.use(notFound);
app.use(errorHandler);

export default app;
