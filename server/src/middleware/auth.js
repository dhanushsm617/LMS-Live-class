import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/errors.js';

export const COOKIE = 'lms_token';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const authCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.cookieSecure,
  maxAge: 7 * 24 * 3600 * 1000,
  path: '/',
});

function extractToken(req) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return req.cookies?.[COOKIE];
}

export async function resolveUser(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    return user && user.isActive ? user : null;
  } catch {
    return null;
  }
}

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await resolveUser(extractToken(req));
  next();
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const user = await resolveUser(extractToken(req));
  if (!user) throw new ApiError(401, 'Please sign in to continue');
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'You do not have permission to do that'));
