import { ZodError } from 'zod';
import multer from 'multer';
import { env } from '../config/env.js';

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse + replace req.body with the zod-validated value. */
export const validate = (schema) => (req, _res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (e) {
    next(e);
  }
};

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: 'Validation failed', errors: err.flatten().fieldErrors });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier' });
  if (err.code === 11000) return res.status(409).json({ message: 'A record with that value already exists' });
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${env.limits.maxVideoMb} MB)` : err.message;
    return res.status(400).json({ message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    message: status < 500 || !env.isProd ? err.message : 'Internal server error',
  });
}
