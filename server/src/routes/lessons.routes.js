import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { lessonDTO } from '../utils/dto.js';
import { getCourseAccess, isStaffAccess, requireCourseOwner } from '../services/access.js';
import { refreshCourseStats } from '../services/courseStats.js';
import { signedCookiesForPrefix } from '../services/cloudfront.js';
import { enqueueVideo } from '../queues/videoQueue.js';
import * as storage from '../services/storage.js';

const router = Router();

const uploadDir = path.join(env.storage.tmpDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: env.limits.maxVideoMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    /^video\//.test(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Only video files can be uploaded')),
});

const updateSchema = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  description: z.string().max(4000).optional(),
  section: z.string().trim().max(80).optional(),
  isPreview: z.boolean().optional(),
});

/** Load the lesson and make sure the caller owns its course (runs BEFORE multer touches the body). */
const loadOwnedLesson = asyncHandler(async (req, _res, next) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  await requireCourseOwner(req.user, lesson.course);
  req.lesson = lesson;
  next();
});

/* ---------------------------- learner: lesson + playback ---------------------------- */

async function loadViewableLesson(req) {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw new ApiError(404, 'Lesson not found');
  const { course, access, enrollment } = await getCourseAccess(req.user, lesson.course);
  const canView = isStaffAccess(access) || access === 'enrolled' || (lesson.isPreview && course.status === 'published');
  if (!canView) throw new ApiError(req.user ? 403 : 401, req.user ? 'Enroll in this course to watch this lesson' : 'Sign in to continue');
  return { lesson, course, access, enrollment };
}

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { lesson, enrollment } = await loadViewableLesson(req);
    const pos = enrollment?.positions.find((p) => String(p.lesson) === String(lesson._id));
    res.json({
      lesson: lessonDTO(lesson, {
        completed: !!enrollment?.completedLessons.some((id) => String(id) === String(lesson._id)),
        position: pos?.seconds || 0,
      }),
    });
  })
);

/**
 * Returns a playback URL and sets the credentials the player needs:
 *  - s3 driver:    CloudFront signed cookies scoped to hls/<lessonId>/*  (Domain=CLOUDFRONT_COOKIE_DOMAIN)
 *  - local driver: a short-lived JWT cookie checked by the /media guard in app.js
 */
router.get(
  '/:id/playback',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { lesson } = await loadViewableLesson(req);
    if (lesson.video.status !== 'ready' || !lesson.video.hlsKey) throw new ApiError(409, 'This video is still being processed');

    const prefix = `hls/${lesson._id}/`;
    let expires;
    if (env.storage.driver === 's3') {
      const signed = signedCookiesForPrefix(prefix);
      expires = signed.expires;
      for (const [name, value] of Object.entries(signed.cookies)) {
        res.cookie(name, value, {
          domain: env.cloudfront.cookieDomain || undefined,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: env.cloudfront.cookieTtlSec * 1000,
        });
      }
    } else {
      expires = Math.floor(Date.now() / 1000) + 4 * 3600;
      const token = jwt.sign({ lesson: String(lesson._id) }, env.jwtSecret, { expiresIn: '4h' });
      res.cookie('lms_media', token, { path: '/media', httpOnly: true, sameSite: 'lax', secure: env.cookieSecure, maxAge: 4 * 3600 * 1000 });
    }
    res.json({
      url: storage.urlFor(lesson.video.hlsKey),
      poster: lesson.video.thumbnailKey ? storage.urlFor(lesson.video.thumbnailKey) : null,
      expiresAt: expires * 1000,
      durationSec: lesson.video.durationSec,
    });
  })
);

/* ---------------------------- instructor: edit / upload ---------------------------- */

router.get(
  '/:id/status',
  requireAuth,
  loadOwnedLesson,
  (req, res) => res.json({ lesson: lessonDTO(req.lesson) })
);

router.patch(
  '/:id',
  requireAuth,
  loadOwnedLesson,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    Object.assign(req.lesson, req.body);
    await req.lesson.save();
    res.json({ lesson: lessonDTO(req.lesson) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  loadOwnedLesson,
  asyncHandler(async (req, res) => {
    const lesson = req.lesson;
    await Promise.all([storage.deletePrefix(`hls/${lesson._id}`), storage.deletePrefix(`raw/${lesson._id}`)]).catch(() => {});
    await Enrollment.updateMany({ course: lesson.course }, { $pull: { completedLessons: lesson._id, positions: { lesson: lesson._id } } });
    await lesson.deleteOne();
    await refreshCourseStats(lesson.course);
    res.json({ deleted: true });
  })
);

/**
 * Upload step: raw file -> storage (raw/<lessonId>/…) -> BullMQ job. The API returns 202 immediately;
 * the FFmpeg worker does the heavy lifting and the editor polls GET /lessons/:id/status.
 */
router.post(
  '/:id/video',
  requireAuth,
  loadOwnedLesson,
  upload.single('video'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Attach a video file in the "video" field');
    const lesson = req.lesson;
    try {
      const ext = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.mp4';
      const rawKey = `raw/${lesson._id}/${Date.now()}${ext}`;
      const previousRaw = lesson.video.originalKey;
      await storage.putFile(req.file.path, rawKey, { contentType: req.file.mimetype });

      lesson.video.status = 'queued';
      lesson.video.progress = 0;
      lesson.video.originalKey = rawKey;
      lesson.video.error = undefined;
      await lesson.save();

      const job = await enqueueVideo({ lessonId: String(lesson._id), rawKey });
      lesson.video.jobId = String(job.id);
      await lesson.save();
      if (previousRaw && previousRaw !== rawKey) storage.deleteKey(previousRaw).catch(() => {});
      res.status(202).json({ lesson: lessonDTO(lesson) });
    } finally {
      fs.rm(req.file.path, { force: true }, () => {});
    }
  })
);

export default router;
