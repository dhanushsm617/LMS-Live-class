import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { COOKIE, authCookieOptions, requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: env.isProd ? 25 : 500, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  // Admins are never self-registered; they are created by seed / DB.
  role: z.enum(['student', 'instructor']).default('student'),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
const profileSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), bio: z.string().max(500).optional() });

router.post(
  '/register',
  limiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw new ApiError(409, 'An account with this email already exists');
    const user = await User.create(req.body);
    res.cookie(COOKIE, signToken(user), authCookieOptions()).status(201).json({ user: user.toPublic() });
  })
);

router.post(
  '/login',
  limiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).select('+password');
    const ok = user && user.isActive && (await user.verifyPassword(req.body.password));
    if (!ok) throw new ApiError(401, 'Invalid email or password');
    res.cookie(COOKIE, signToken(user), authCookieOptions()).json({ user: user.toPublic() });
  })
);

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' }).json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

router.patch(
  '/me',
  requireAuth,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    Object.assign(req.user, req.body);
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

export default router;
