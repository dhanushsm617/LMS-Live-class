import { Router } from 'express';
import { z } from 'zod';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Lesson from '../models/Lesson.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getCourseAccess, isStaffAccess, requireCourseOwner } from '../services/access.js';
import { gradeAttempt, sanitizeQuiz } from '../services/quizGrading.js';
import { recalcProgress } from '../services/progress.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const questionSchema = z
  .object({
    prompt: z.string().trim().min(3, 'Write the question'),
    type: z.enum(['single', 'multiple', 'truefalse']),
    options: z.array(z.object({ text: z.string().trim().min(1, 'Option text is empty'), isCorrect: z.boolean() })).min(2).max(8),
    points: z.number().int().min(1).max(10).default(1),
    explanation: z.string().max(1000).default(''),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (correct === 0) ctx.addIssue({ code: 'custom', message: `"${q.prompt.slice(0, 40)}": mark at least one correct option` });
    if (q.type !== 'multiple' && correct !== 1) ctx.addIssue({ code: 'custom', message: `"${q.prompt.slice(0, 40)}": exactly one option must be correct` });
    if (q.type === 'truefalse' && q.options.length !== 2) ctx.addIssue({ code: 'custom', message: 'True/false questions have exactly two options' });
  });

const quizSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(1000).default(''),
  lesson: objectId.optional(),
  passPercent: z.number().int().min(1).max(100).default(60),
  maxAttempts: z.number().int().min(0).max(50).default(0),
  required: z.boolean().default(true),
  questions: z.array(questionSchema).min(1, 'Add at least one question').max(100),
});

const attemptSchema = z.object({
  answers: z.array(z.object({ question: objectId, selected: z.array(z.number().int().min(0).max(7)).max(8) })).max(100),
});

/* ------------------------------ authoring ------------------------------ */

router.post(
  '/courses/:courseId/quizzes',
  validate(quizSchema),
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.courseId);
    if (req.body.lesson && !(await Lesson.exists({ _id: req.body.lesson, course: course._id }))) throw new ApiError(400, 'Lesson does not belong to this course');
    const quiz = await Quiz.create({ ...req.body, course: course._id });
    res.status(201).json({ quiz });
  })
);

router.put(
  '/quizzes/:id',
  validate(quizSchema),
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) throw new ApiError(404, 'Quiz not found');
    await requireCourseOwner(req.user, quiz.course);
    quiz.set(req.body);
    await quiz.save();
    res.json({ quiz });
  })
);

router.delete(
  '/quizzes/:id',
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) throw new ApiError(404, 'Quiz not found');
    await requireCourseOwner(req.user, quiz.course);
    await Promise.all([quiz.deleteOne(), QuizAttempt.deleteMany({ quiz: quiz._id })]);
    res.json({ deleted: true });
  })
);

/* ------------------------------ taking a quiz ------------------------------ */

router.get(
  '/quizzes/:id',
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) throw new ApiError(404, 'Quiz not found');
    const { access } = await getCourseAccess(req.user, quiz.course);
    if (isStaffAccess(access)) return res.json({ quiz });
    if (access !== 'enrolled') throw new ApiError(403, 'Enroll in this course to take the quiz');
    const attempts = await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id });
    res.json({ quiz: sanitizeQuiz(quiz), attempts });
  })
);

router.post(
  '/quizzes/:id/attempts',
  validate(attemptSchema),
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) throw new ApiError(404, 'Quiz not found');
    const { access, enrollment } = await getCourseAccess(req.user, quiz.course);
    if (access !== 'enrolled') throw new ApiError(403, 'Only enrolled students can submit quiz attempts');

    const used = await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id });
    if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) throw new ApiError(403, `You have used all ${quiz.maxAttempts} attempts`);

    const graded = gradeAttempt(quiz, req.body.answers);
    const attempt = await QuizAttempt.create({
      quiz: quiz._id,
      course: quiz.course,
      student: req.user._id,
      answers: req.body.answers,
      results: graded.results,
      score: graded.score,
      maxScore: graded.maxScore,
      percent: graded.percent,
      passed: graded.passed,
    });

    const { enrollment: updated, certificate } = await recalcProgress(enrollment._id);
    res.status(201).json({
      attempt: { id: attempt._id, score: graded.score, maxScore: graded.maxScore, percent: graded.percent, passed: graded.passed, number: used + 1 },
      // Correct options are only revealed once the learner has passed
      review: graded.detail.map((d) => ({ ...d, correctOptions: graded.passed ? d.correctOptions : undefined })),
      attemptsLeft: quiz.maxAttempts > 0 ? quiz.maxAttempts - (used + 1) : null,
      progress: { percent: updated.percent, status: updated.status },
      certificate: certificate ? { id: certificate._id, code: certificate.code } : null,
    });
  })
);

export default router;
