import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { parse as parseCookie } from 'cookie';
import { env } from '../config/env.js';
import { createRedis } from '../config/redis.js';
import { COOKIE, resolveUser } from '../middleware/auth.js';
import LiveClass from '../models/LiveClass.js';
import ChatMessage from '../models/ChatMessage.js';
import { getCourseAccess, isStaffAccess } from '../services/access.js';

let io;
const room = (liveClassId) => `live:${liveClassId}`;

/** Push a server-side event (e.g. class started/ended) to everyone in a live room. */
export const emitToLive = (liveClassId, event, payload) => io?.to(room(liveClassId)).emit(event, payload);

/** Simple per-socket token bucket: 5 messages / 5 seconds. */
function allow(socket) {
  const now = Date.now();
  socket.data.hits = (socket.data.hits || []).filter((t) => now - t < 5000);
  if (socket.data.hits.length >= 5) return false;
  socket.data.hits.push(now);
  return true;
}

export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.clientUrl, credentials: true } });

  // Horizontal scaling: rooms are shared across API instances through Redis pub/sub
  const pub = createRedis();
  io.adapter(createAdapter(pub, pub.duplicate()));

  // Authenticate with the same httpOnly cookie as the REST API
  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie || '');
    const user = await resolveUser(cookies[COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.on('chat:join', async ({ liveClassId } = {}, ack) => {
      try {
        const live = await LiveClass.findById(liveClassId);
        if (!live) throw new Error('Class not found');
        const { access } = await getCourseAccess(user, live.course);
        if (!access) throw new Error('Not enrolled');
        socket.join(room(liveClassId));
        socket.data.live = { id: String(live._id), staff: isStaffAccess(access) };
        const count = (await io.in(room(liveClassId)).fetchSockets()).length;
        io.to(room(liveClassId)).emit('chat:presence', { count });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('chat:message', async ({ text } = {}, ack) => {
      const live = socket.data.live;
      if (!live) return ack?.({ ok: false, error: 'Join the class first' });
      const clean = String(text || '').trim().slice(0, 500);
      if (!clean) return ack?.({ ok: false, error: 'Empty message' });
      if (!allow(socket)) return ack?.({ ok: false, error: 'You are sending messages too fast' });

      const msg = await ChatMessage.create({ liveClass: live.id, user: user._id, userName: user.name, role: user.role, text: clean });
      io.to(room(live.id)).emit('chat:message', { id: msg._id, userId: String(user._id), userName: user.name, role: user.role, text: clean, createdAt: msg.createdAt });
      ack?.({ ok: true });
    });

    socket.on('disconnecting', () => {
      const live = socket.data.live;
      if (!live) return;
      // count is evaluated after this socket leaves
      setTimeout(async () => {
        const count = (await io.in(room(live.id)).fetchSockets()).length;
        io.to(room(live.id)).emit('chat:presence', { count });
      }, 100);
    });
  });
  return io;
}
