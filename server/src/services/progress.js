import crypto from 'node:crypto';
import Enrollment from '../models/Enrollment.js';
import Lesson from '../models/Lesson.js';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import Certificate from '../models/Certificate.js';
import Course from '../models/Course.js';
import User from '../models/User.js';

/** Issue (or return the existing) certificate for a completed enrollment. */
export async function issueCertificate(enrollment) {
  const existing = await Certificate.findOne({ student: enrollment.student, course: enrollment.course });
  if (existing) return existing;
  const [student, course] = await Promise.all([
    User.findById(enrollment.student),
    Course.findById(enrollment.course).populate('instructor', 'name'),
  ]);
  const cert = await Certificate.create({
    code: `LMS-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    student: student._id,
    course: course._id,
    studentName: student.name,
    courseTitle: course.title,
    instructorName: course.instructor?.name || 'Instructor',
  });
  enrollment.certificate = cert._id;
  await enrollment.save();
  return cert;
}

/**
 * Progress = (completed lessons + passed required quizzes) / (all lessons + all required quizzes).
 * When it reaches 100% the enrollment is marked completed and a certificate is issued (once).
 */
export async function recalcProgress(enrollmentId) {
  const enr = await Enrollment.findById(enrollmentId);
  const [lessonIds, requiredQuizIds] = await Promise.all([
    Lesson.find({ course: enr.course }).distinct('_id'),
    Quiz.find({ course: enr.course, required: true }).distinct('_id'),
  ]);
  const lessonSet = new Set(lessonIds.map(String));
  const completed = new Set(enr.completedLessons.map(String).filter((id) => lessonSet.has(id)));
  const passedQuizzes = requiredQuizIds.length
    ? await QuizAttempt.find({ student: enr.student, quiz: { $in: requiredQuizIds }, passed: true }).distinct('quiz')
    : [];

  const total = lessonIds.length + requiredQuizIds.length;
  const done = completed.size + passedQuizzes.length;
  enr.percent = total ? Math.round((done / total) * 100) : 0;

  let certificate = null;
  if (total > 0 && done >= total && enr.status !== 'completed') {
    enr.status = 'completed';
    enr.completedAt = new Date();
    await enr.save();
    certificate = await issueCertificate(enr);
  } else {
    await enr.save();
  }
  return { enrollment: enr, certificate };
}
