import { Router } from 'express';
import { z } from 'zod';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import LiveClass from '../models/LiveClass.js';
import ChatMessage from '../models/ChatMessage.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler, validate } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getCourseAccess, isStaffAccess, requireCourseOwner } from '../services/access.js';
import { emitToLive } from '../sockets/chat.js';

const router = Router();
router.use(requireAuth);

const scheduleSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(2000).optional(),
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 5 * 60_000, 'Pick a time in the future'),
  durationMin: z.number().int().min(5).max(480).default(60),
});

const dto = (l, course) => ({
  id: l._id,
  title: l.title,
  description: l.description,
  scheduledAt: l.scheduledAt,
  durationMin: l.durationMin,
  status: l.status,
  startedAt: l.startedAt,
  course: course ? { id: course._id, title: course.title, slug: course.slug } : l.course,
});

async function loadForHost(req) {
  const live = await LiveClass.findById(req.params.id);
  if (!live) throw new ApiError(404, 'Live class not found');
  await requireCourseOwner(req.user, live.course);
  return live;
}

/* ------------------------------ schedule & list ------------------------------ */

router.post(
  '/courses/:courseId/live',
  validate(scheduleSchema),
  asyncHandler(async (req, res) => {
    const course = await requireCourseOwner(req.user, req.params.courseId);
    const live = await LiveClass.create({ ...req.body, course: course._id, instructor: course.instructor });
    res.status(201).json({ liveClass: dto(live, course) });
  })
);

router.get(
  '/courses/:courseId/live',
  asyncHandler(async (req, res) => {
    const { course, access } = await getCourseAccess(req.user, req.params.courseId);
    if (!access) throw new ApiError(403, 'Enroll to see live classes for this course');
    const items = await LiveClass.find({ course: course._id, status: { $ne: 'cancelled' } }).sort('-scheduledAt').limit(50);
    res.json({ items: items.map((l) => dto(l, course)) });
  })
);

/** Everything coming up (or live right now) across the user's courses. */
router.get(
  '/live/upcoming',
  asyncHandler(async (req, res) => {
    const courseIds =
      req.user.role === 'instructor' || req.user.role === 'admin'
        ? await Course.find({ instructor: req.user._id }).distinct('_id')
        : await Enrollment.find({ student: req.user._id }).distinct('course');
    const items = await LiveClass.find({
      course: { $in: courseIds },
      $or: [{ status: 'live' }, { status: 'scheduled', scheduledAt: { $gte: new Date(Date.now() - 3 * 3600_000) } }],
    })
      .sort('scheduledAt')
      .limit(30)
      .populate('course', 'title slug');
    res.json({ items: items.map((l) => dto(l, l.course)) });
  })
);

router.get(
  '/live/:id',
  asyncHandler(async (req, res) => {
    const live = await LiveClass.findById(req.params.id).populate('course', 'title slug');
    if (!live) throw new ApiError(404, 'Live class not found');
    const { access } = await getCourseAccess(req.user, live.course._id);
    if (!access) throw new ApiError(403, 'Enroll in the course to join this class');
    res.json({ liveClass: dto(live, live.course), isHost: isStaffAccess(access) });
  })
);

/* ------------------------------ lifecycle (host) ------------------------------ */

router.post(
  '/live/:id/start',
  asyncHandler(async (req, res) => {
    const live = await loadForHost(req);
    if (live.status === 'ended' || live.status === 'cancelled') throw new ApiError(409, `This class has already ${live.status === 'ended' ? 'ended' : 'been cancelled'}`);
    if (live.status !== 'live') {
      live.status = 'live';
      live.startedAt = new Date();
      await live.save();
      emitToLive(live._id, 'live:started', { liveClassId: String(live._id) });
    }
    res.json({ liveClass: dto(live) });
  })
);

router.post(
  '/live/:id/end',
  asyncHandler(async (req, res) => {
    const live = await loadForHost(req);
    live.status = 'ended';
    live.endedAt = new Date();
    await live.save();
    emitToLive(live._id, 'live:ended', { liveClassId: String(live._id) });
    // Kick everyone out of the media room (best effort – the room also expires on its own)
    new RoomServiceClient(env.livekit.url.replace(/^ws/, 'http'), env.livekit.apiKey, env.livekit.apiSecret)
      .deleteRoom(live.roomName)
      .catch(() => {});
    res.json({ liveClass: dto(live) });
  })
);

router.delete(
  '/live/:id',
  asyncHandler(async (req, res) => {
    const live = await loadForHost(req);
    if (live.status === 'live') throw new ApiError(409, 'End the class before cancelling it');
    live.status = 'cancelled';
    await live.save();
    res.json({ cancelled: true });
  })
);

/* ------------------------------ joining ------------------------------ */

/**
 * LiveKit (an open-source WebRTC SFU) does the media routing. We only mint a short-lived access token:
 *  - host:    may publish camera / mic / screen
 *  - student: subscribe-only (+ data channel); chat itself goes through Socket.IO
 */
router.post(
  '/live/:id/token',
  asyncHandler(async (req, res) => {
    const live = await LiveClass.findById(req.params.id);
    if (!live) throw new ApiError(404, 'Live class not found');
    const { access } = await getCourseAccess(req.user, live.course);
    if (!access) throw new ApiError(403, 'Enroll in the course to join this class');
    const isHost = isStaffAccess(access);
    if (live.status === 'ended' || live.status === 'cancelled') throw new ApiError(409, 'This class is over');
    if (!isHost && live.status !== 'live') throw new ApiError(409, 'The class has not started yet');

    const token = new AccessToken(env.livekit.apiKey, env.livekit.apiSecret, {
      identity: String(req.user._id),
      name: req.user.name,
      ttl: '3h',
      metadata: JSON.stringify({ role: req.user.role }),
    });
    token.addGrant({ roomJoin: true, room: live.roomName, canPublish: isHost, canPublishData: true, canSubscribe: true });
    res.json({ token: await token.toJwt(), serverUrl: env.livekit.publicUrl, roomName: live.roomName, isHost });
  })
);

router.get(
  '/live/:id/messages',
  asyncHandler(async (req, res) => {
    const live = await LiveClass.findById(req.params.id);
    if (!live) throw new ApiError(404, 'Live class not found');
    const { access } = await getCourseAccess(req.user, live.course);
    if (!access) throw new ApiError(403, 'Not allowed');
    const filter = { liveClass: live._id };
    if (req.query.before) filter.createdAt = { $lt: new Date(String(req.query.before)) };
    const items = await ChatMessage.find(filter).sort('-createdAt').limit(50);
    res.json({
      items: items.reverse().map((m) => ({ id: m._id, userId: String(m.user), userName: m.userName, role: m.role, text: m.text, createdAt: m.createdAt })),
    });
  })
);

export default router;
