import { Router } from 'express';
import { z } from 'zod';
import User, { ROLES } from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Payment from '../models/Payment.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { courseCard, escapeRegex } from '../utils/dto.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, courses, pending, enrollments, revenue] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments({ status: 'published' }),
      Course.countDocuments({ status: 'pending' }),
      Enrollment.countDocuments(),
      Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, gross: { $sum: '$amount' }, fees: { $sum: '$platformFee' } } }]),
    ]);
    res.json({ users, publishedCourses: courses, pendingCourses: pending, enrollments, gross: revenue[0]?.gross || 0, platformRevenue: revenue[0]?.fees || 0 });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 20;
    const filter = {};
    if (req.query.role && ROLES.includes(req.query.role)) filter.role = req.query.role;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q)), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([User.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
    res.json({ items: items.map((u) => ({ ...u.toPublic(), isActive: u.isActive, createdAt: u.createdAt })), total, page, pages: Math.ceil(total / limit) });
  })
);

router.patch(
  '/users/:id',
  validate(z.object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) throw new ApiError(400, "You can't change your own role or status");
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ user: { ...user.toPublic(), isActive: user.isActive } });
  })
);

router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const filter = req.query.status ? { status: String(req.query.status) } : {};
    const courses = await Course.find(filter).sort('-updatedAt').limit(100).populate('instructor', 'name');
    res.json({ items: courses.map((c) => ({ ...courseCard(c), reviewNote: c.reviewNote })) });
  })
);

router.patch(
  '/courses/:id/review',
  validate(z.object({ action: z.enum(['approve', 'reject', 'unpublish']), note: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);
    if (!course) throw new ApiError(404, 'Course not found');
    const { action, note } = req.body;
    if (action === 'approve') {
      course.status = 'published';
      course.publishedAt ??= new Date();
      course.reviewNote = undefined;
    } else if (action === 'reject') {
      if (!note) throw new ApiError(400, 'Tell the instructor what to fix');
      course.status = 'rejected';
      course.reviewNote = note;
    } else {
      course.status = 'draft';
    }
    await course.save();
    res.json({ course: courseCard(course) });
  })
);

export default router;
