import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { ApiError } from '../utils/errors.js';

/**
 * Work out what a user may do with a course.
 * Returns { course, access } where access is 'owner' | 'admin' | 'enrolled' | null.
 */
export async function getCourseAccess(user, courseId) {
  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, 'Course not found');
  if (!user) return { course, access: null };
  if (user.role === 'admin') return { course, access: 'admin' };
  if (String(course.instructor) === String(user._id)) return { course, access: 'owner' };
  const enrollment = await Enrollment.findOne({ student: user._id, course: course._id });
  return { course, access: enrollment ? 'enrolled' : null, enrollment };
}

export const isStaffAccess = (access) => access === 'owner' || access === 'admin';

/** Throw unless the user owns the course (or is admin). */
export async function requireCourseOwner(user, courseId) {
  const { course, access } = await getCourseAccess(user, courseId);
  if (!isStaffAccess(access)) throw new ApiError(403, 'Only the course instructor can do that');
  return course;
}
