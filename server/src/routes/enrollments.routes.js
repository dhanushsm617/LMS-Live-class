import { Router } from 'express';
import { z } from 'zod';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Enrollment from '../models/Enrollment.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { courseCard, lessonDTO } from '../utils/dto.js';
import { getCourseAccess, isStaffAccess } from '../services/access.js';
import { recalcProgress } from '../services/progress.js';
import { refreshCourseStats } from '../services/courseStats.js';

const router = Router();
router.use(requireAuth);

const COMPLETE_THRESHOLD = 0.8; // must have watched ≥80% of a video lesson to mark it complete

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const items = await Enrollment.find({ student: req.user._id })
      .sort('-updatedAt')
      .populate({ path: 'course', populate: { path: 'instructor', select: 'name' } })
      .populate('certificate', 'code');
    res.json({
      items: items
        .filter((e) => e.course)
        .map((e) => ({
          id: e._id,
          percent: e.percent,
          status: e.status,
          lastLesson: e.lastLesson,
          completedAt: e.completedAt,
          certificate: e.certificate ? { id: e.certificate._id, code: e.certificate.code } : null,
          course: courseCard(e.course),
        })),
    });
  })
);

/** Enroll in a free course. Paid courses go through /payments/checkout. */
router.post(
  '/free/:courseId',
  asyncHandler(async (req, res) => {
    const course = await Course.findOne({ _id: req.params.courseId, status: 'published' });
    if (!course) throw new ApiError(404, 'Course not found');
    if (course.price > 0) throw new ApiError(402, 'This course requires payment');
    if (String(course.instructor) === String(req.user._id)) throw new ApiError(400, 'You teach this course');
    const enrollment = await Enrollment.findOneAndUpdate(
      { student: req.user._id, course: course._id },
      { $setOnInsert: { source: 'free' } },
      { upsert: true, new: true }
    );
    await refreshCourseStats(course._id);
    res.status(201).json({ enrollment: { id: enrollment._id, percent: enrollment.percent } });
  })
);

/** Full learner view of a course: lessons with completion/resume state + quizzes with attempt summary. */
router.get(
  '/course/:courseId',
  asyncHandler(async (req, res) => {
    const { course, access, enrollment } = await getCourseAccess(req.user, req.params.courseId);
    if (!enrollment && !isStaffAccess(access)) throw new ApiError(403, 'You are not enrolled in this course');

    const [lessons, quizzes, attemptStats] = await Promise.all([
      Lesson.find({ course: course._id }).sort('order'),
      Quiz.find({ course: course._id }).sort('createdAt'),
      QuizAttempt.aggregate([
        { $match: { course: course._id, student: req.user._id } },
        { $group: { _id: '$quiz', attempts: { $sum: 1 }, best: { $max: '$percent' }, passed: { $max: { $cond: ['$passed', 1, 0] } } } },
      ]),
    ]);
    const done = new Set((enrollment?.completedLessons || []).map(String));
    const positions = new Map((enrollment?.positions || []).map((p) => [String(p.lesson), p]));
    const stats = new Map(attemptStats.map((s) => [String(s._id), s]));

    res.json({
      course: { id: course._id, title: course.title, slug: course.slug },
      access,
      enrollment: enrollment
        ? { id: enrollment._id, percent: enrollment.percent, status: enrollment.status, lastLesson: enrollment.lastLesson, certificate: enrollment.certificate }
        : null,
      lessons: lessons.map((l) => {
        const pos = positions.get(String(l._id));
        return lessonDTO(l, { completed: done.has(String(l._id)), position: pos?.seconds || 0 });
      }),
      quizzes: quizzes.map((q) => {
        const s = stats.get(String(q._id));
        return {
          id: q._id,
          title: q.title,
          lesson: q.lesson,
          required: q.required,
          passPercent: q.passPercent,
          maxAttempts: q.maxAttempts,
          questionCount: q.questions.length,
          attempts: s?.attempts || 0,
          bestPercent: s?.best ?? null,
          passed: !!s?.passed,
        };
      }),
    });
  })
);

/** Save the resume point (called by the player every few seconds). */
router.put(
  '/course/:courseId/lessons/:lessonId/position',
  validate(z.object({ seconds: z.number().min(0).max(24 * 3600) })),
  asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const seconds = Math.floor(req.body.seconds);
    const enr = await Enrollment.findOne({ student: req.user._id, course: courseId });
    if (!enr) throw new ApiError(403, 'Not enrolled');
    if (!(await Lesson.exists({ _id: lessonId, course: courseId }))) throw new ApiError(404, 'Lesson not found');

    const now = new Date();
    const updated = await Enrollment.updateOne(
      { _id: enr._id, 'positions.lesson': lessonId },
      { $set: { 'positions.$.seconds': seconds, 'positions.$.updatedAt': now, lastLesson: lessonId }, $max: { 'positions.$.maxSeconds': seconds } }
    );
    if (!updated.matchedCount) {
      await Enrollment.updateOne(
        { _id: enr._id },
        { $push: { positions: { lesson: lessonId, seconds, maxSeconds: seconds, updatedAt: now } }, $set: { lastLesson: lessonId } }
      );
    }
    res.json({ ok: true });
  })
);

router.post(
  '/course/:courseId/lessons/:lessonId/complete',
  asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    const enr = await Enrollment.findOne({ student: req.user._id, course: courseId });
    if (!enr) throw new ApiError(403, 'Not enrolled');
    const lesson = await Lesson.findOne({ _id: lessonId, course: courseId });
    if (!lesson) throw new ApiError(404, 'Lesson not found');

    // Light anti-skip rule for video lessons
    const duration = lesson.video?.durationSec || 0;
    if (duration > 0) {
      const maxSeconds = enr.positions.find((p) => String(p.lesson) === lessonId)?.maxSeconds || 0;
      if (maxSeconds < duration * COMPLETE_THRESHOLD) {
        throw new ApiError(400, 'Watch most of the lesson before marking it complete');
      }
    }
    await Enrollment.updateOne({ _id: enr._id }, { $addToSet: { completedLessons: lesson._id }, $set: { lastLesson: lesson._id } });
    const { enrollment, certificate } = await recalcProgress(enr._id);
    res.json({ percent: enrollment.percent, status: enrollment.status, certificate: certificate ? { id: certificate._id, code: certificate.code } : null });
  })
);

export default router;
