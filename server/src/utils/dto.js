/** Public shape of a lesson – never leaks storage keys. */
export function lessonDTO(lesson, extra = {}) {
  const l = lesson.toObject ? lesson.toObject() : lesson;
  return {
    id: l._id,
    course: l.course,
    title: l.title,
    description: l.description,
    section: l.section,
    order: l.order,
    isPreview: l.isPreview,
    video: {
      status: l.video?.status || 'none',
      progress: l.video?.progress || 0,
      durationSec: l.video?.durationSec || 0,
      renditions: (l.video?.renditions || []).map((r) => r.name),
      error: l.video?.error,
    },
    ...extra,
  };
}

export function courseCard(course) {
  const c = course.toObject ? course.toObject() : course;
  return {
    id: c._id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    category: c.category,
    level: c.level,
    thumbnail: c.thumbnail,
    price: c.price,
    currency: c.currency,
    status: c.status,
    lessonCount: c.lessonCount,
    durationSec: c.durationSec,
    enrollmentCount: c.enrollmentCount,
    instructor: c.instructor && c.instructor.name ? { id: c.instructor._id, name: c.instructor.name } : c.instructor,
    createdAt: c.createdAt,
  };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
