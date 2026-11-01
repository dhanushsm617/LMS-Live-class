import { Router } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCourseOwner } from '../services/access.js';

const router = Router();
router.use(requireAuth, requireRole('instructor', 'admin'));

/** Revenue dashboard data: totals, per-course breakdown, 12-month trend, recent sales. */
router.get(
  '/revenue',
  asyncHandler(async (req, res) => {
    const months = Math.min(24, Math.max(3, Number(req.query.months) || 12));
    const instructor = new mongoose.Types.ObjectId(req.user._id);
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCMonth(since.getUTCMonth() - (months - 1));

    const paid = { instructor, status: 'paid' };
    const sum = { gross: { $sum: '$amount' }, earnings: { $sum: '$instructorEarnings' }, fees: { $sum: '$platformFee' }, sales: { $sum: 1 } };

    const [totals, thisMonth, byCourse, monthlyRaw, recent, studentCount] = await Promise.all([
      Payment.aggregate([{ $match: paid }, { $group: { _id: null, ...sum } }]),
      Payment.aggregate([{ $match: { ...paid, paidAt: { $gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } } }, { $group: { _id: null, ...sum } }]),
      Payment.aggregate([
        { $match: paid },
        { $group: { _id: '$course', ...sum } },
        { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
        { $unwind: '$course' },
        { $project: { _id: 0, courseId: '$_id', title: '$course.title', slug: '$course.slug', gross: 1, earnings: 1, fees: 1, sales: 1 } },
        { $sort: { earnings: -1 } },
      ]),
      Payment.aggregate([
        { $match: { ...paid, paidAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, earnings: { $sum: '$instructorEarnings' }, sales: { $sum: 1 } } },
      ]),
      Payment.find(paid).sort('-paidAt').limit(10).populate('course', 'title').populate('student', 'name'),
      Payment.distinct('student', paid).then((a) => a.length),
    ]);

    // Fill gaps so the chart always has a continuous x-axis
    const byMonth = new Map(monthlyRaw.map((m) => [m._id, m]));
    const monthly = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      monthly.push({ month: key, earnings: byMonth.get(key)?.earnings || 0, sales: byMonth.get(key)?.sales || 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    res.json({
      currency: env.payments.currency,
      totals: totals[0] ? { gross: totals[0].gross, earnings: totals[0].earnings, fees: totals[0].fees, sales: totals[0].sales, students: studentCount } : { gross: 0, earnings: 0, fees: 0, sales: 0, students: 0 },
      thisMonth: thisMonth[0] ? { earnings: thisMonth[0].earnings, sales: thisMonth[0].sales } : { earnings: 0, sales: 0 },
      byCourse,
      monthly,
      recent: recent.map((p) => ({ id: p._id, course: p.course?.title, student: p.student?.name, amount: p.amount, earnings: p.instructorEarnings, currency: p.currency, paidAt: p.paidAt })),
    });
  })
);

/** Students of one of my courses with their progress. */
router.get(
  '/courses/:courseId/students',
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.courseId);
    const enrollments = await Enrollment.find({ course: course._id }).sort('-updatedAt').limit(200).populate('student', 'name email');
    res.json({
      items: enrollments.map((e) => ({ id: e._id, name: e.student?.name, email: e.student?.email, percent: e.percent, status: e.status, enrolledAt: e.createdAt, completedAt: e.completedAt })),
    });
  })
);

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const courses = await Course.find({ instructor: req.user._id }).select('status enrollmentCount');
    res.json({
      courses: courses.length,
      published: courses.filter((c) => c.status === 'published').length,
      learners: courses.reduce((n, c) => n + c.enrollmentCount, 0),
    });
  })
);

export default router;
