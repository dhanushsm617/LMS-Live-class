import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Course, { LEVELS } from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Quiz from '../models/Quiz.js';
import LiveClass from '../models/LiveClass.js';
import Enrollment from '../models/Enrollment.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { courseCard, escapeRegex, lessonDTO } from '../utils/dto.js';
import { getCourseAccess, isStaffAccess, requireCourseOwner } from '../services/access.js';
import { refreshCourseStats } from '../services/courseStats.js';
import * as storage from '../services/storage.js';

const router = Router();
const instructorOnly = [requireAuth, requireRole('instructor', 'admin')];

const base = z.object({
  title: z.string().trim().min(5).max(120),
  subtitle: z.string().trim().max(200).optional(),
  description: z.string().trim().min(20, 'Describe the course in at least 20 characters').max(5000),
  category: z.string().trim().min(2).max(40).optional(),
  level: z.enum(LEVELS).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  thumbnail: z.union([z.string().url(), z.literal('')]).optional(),
  // minor units; 0 = free, otherwise at least ₹1 / $1
  price: z.number().int().min(0).max(10_000_000).refine((p) => p === 0 || p >= 100, 'Minimum paid price is 1.00').optional(),
});
const createSchema = base;
const updateSchema = base.partial();
const lessonSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().max(4000).optional(),
  section: z.string().trim().max(80).optional(),
  isPreview: z.boolean().optional(),
});

/* ------------------------------ catalog (public) ------------------------------ */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, category, level, sort = 'popular', free } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const filter = { status: 'published' };
    if (q) filter.title = { $regex: escapeRegex(String(q)), $options: 'i' };
    if (category) filter.category = String(category);
    if (level) filter.level = String(level);
    if (free === 'true') filter.price = 0;
    const sorts = { popular: { enrollmentCount: -1 }, newest: { publishedAt: -1 }, 'price-asc': { price: 1 }, 'price-desc': { price: -1 } };

    const [items, total, categories] = await Promise.all([
      Course.find(filter).sort(sorts[sort] || sorts.popular).skip((page - 1) * limit).limit(limit).populate('instructor', 'name'),
      Course.countDocuments(filter),
      Course.distinct('category', { status: 'published' }),
    ]);
    res.json({ items: items.map(courseCard), total, page, pages: Math.ceil(total / limit), categories: categories.sort() });
  })
);

/* ------------------------------ instructor workspace ------------------------------ */

router.get(
  '/mine',
  ...instructorOnly,
  asyncHandler(async (req, res) => {
    const filter = req.user.role === 'admin' && req.query.all === 'true' ? {} : { instructor: req.user._id };
    const courses = await Course.find(filter).sort('-updatedAt').populate('instructor', 'name');
    res.json({ items: courses.map((c) => ({ ...courseCard(c), reviewNote: c.reviewNote })) });
  })
);

router.post(
  '/',
  ...instructorOnly,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const course = await Course.create({ ...req.body, instructor: req.user._id, currency: env.payments.currency });
    res.status(201).json({ course: courseCard(course) });
  })
);

/** Everything the course editor needs in one call. */
router.get(
  '/:id/manage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    const [lessons, quizzes, liveClasses] = await Promise.all([
      Lesson.find({ course: course._id }).sort('order'),
      Quiz.find({ course: course._id }).sort('createdAt'),
      LiveClass.find({ course: course._id }).sort('-scheduledAt'),
    ]);
    res.json({ course: { ...courseCard(course), description: course.description, tags: course.tags, reviewNote: course.reviewNote }, lessons: lessons.map((l) => lessonDTO(l)), quizzes, liveClasses });
  })
);

router.patch(
  '/:id',
  requireAuth,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    Object.assign(course, req.body);
    // Editing a published course's price/content doesn't unpublish it; rejected ones go back to draft.
    if (course.status === 'rejected') course.status = 'draft';
    await course.save();
    res.json({ course: courseCard(course) });
  })
);

router.post(
  '/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    if (!['draft', 'rejected'].includes(course.status)) throw new ApiError(400, `A ${course.status} course can't be submitted`);
    const ready = await Lesson.countDocuments({ course: course._id, 'video.status': 'ready' });
    if (!ready) throw new ApiError(400, 'Add at least one lesson with a processed video before submitting');
    course.status = 'pending';
    course.reviewNote = undefined;
    await course.save();
    res.json({ course: courseCard(course) });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    if (course.enrollmentCount > 0 || (await Enrollment.exists({ course: course._id }))) {
      course.status = 'archived'; // keep learners' access & history intact
      await course.save();
      return res.json({ archived: true });
    }
    const lessons = await Lesson.find({ course: course._id }).select('_id');
    await Promise.all(lessons.flatMap((l) => [storage.deletePrefix(`hls/${l._id}`), storage.deletePrefix(`raw/${l._id}`)])).catch(() => {});
    await Promise.all([Lesson.deleteMany({ course: course._id }), Quiz.deleteMany({ course: course._id }), LiveClass.deleteMany({ course: course._id }), course.deleteOne()]);
    res.json({ deleted: true });
  })
);

/* ------------------------------ lessons (structure) ------------------------------ */

router.post(
  '/:id/lessons',
  requireAuth,
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    const last = await Lesson.findOne({ course: course._id }).sort('-order').select('order');
    const lesson = await Lesson.create({ ...req.body, course: course._id, order: (last?.order ?? -1) + 1 });
    await refreshCourseStats(course._id);
    res.status(201).json({ lesson: lessonDTO(lesson) });
  })
);

router.put(
  '/:id/lessons/reorder',
  requireAuth,
  validate(z.object({ ids: z.array(z.string()).min(1) })),
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.id);
    await Lesson.bulkWrite(
      req.body.ids.map((id, order) => ({ updateOne: { filter: { _id: id, course: course._id }, update: { order } } }))
    );
    res.json({ ok: true });
  })
);

/* ------------------------------ public detail (keep LAST: matches any /:x) ------------------------------ */

router.get(
  '/:idOrSlug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;
    const query = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
    const course = await Course.findOne(query).populate('instructor', 'name bio');
    if (!course) throw new ApiError(404, 'Course not found');

    const { access, enrollment } = await getCourseAccess(req.user, course._id);
    if (course.status !== 'published' && !isStaffAccess(access) && access !== 'enrolled') throw new ApiError(404, 'Course not found');

    const [lessons, quizCount, upcoming] = await Promise.all([
      Lesson.find({ course: course._id }).sort('order'),
      Quiz.countDocuments({ course: course._id }),
      LiveClass.countDocuments({ course: course._id, status: { $in: ['scheduled', 'live'] }, scheduledAt: { $gte: new Date(Date.now() - 6 * 3600_000) } }),
    ]);
    res.json({
      course: { ...courseCard(course), description: course.description, tags: course.tags, instructor: { id: course.instructor._id, name: course.instructor.name, bio: course.instructor.bio } },
      lessons: lessons.map((l) => {
        const dto = lessonDTO(l);
        return { id: dto.id, title: dto.title, section: dto.section, order: dto.order, isPreview: dto.isPreview, durationSec: dto.video.durationSec };
      }),
      quizCount,
      upcomingLiveClasses: upcoming,
      access,
      enrollment: enrollment ? { percent: enrollment.percent, status: enrollment.status } : null,
    });
  })
);

export default router;
