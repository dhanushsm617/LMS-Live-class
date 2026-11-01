import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';

/** Refresh the denormalised counters shown on catalog cards. */
export async function refreshCourseStats(courseId) {
  const [lessons, enrollmentCount] = await Promise.all([
    Lesson.aggregate([
      { $match: { course: courseId } },
      { $group: { _id: null, count: { $sum: 1 }, duration: { $sum: '$video.durationSec' } } },
    ]),
    Enrollment.countDocuments({ course: courseId }),
  ]);
  await Course.updateOne(
    { _id: courseId },
    { lessonCount: lessons[0]?.count || 0, durationSec: lessons[0]?.duration || 0, enrollmentCount }
  );
}
