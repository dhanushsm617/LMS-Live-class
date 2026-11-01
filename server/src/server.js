import http from 'node:http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { initSockets } from './sockets/chat.js';
import { closeVideoQueue } from './queues/videoQueue.js';

async function main() {
  await connectDb();
  const server = http.createServer(app);
  initSockets(server);
  server.listen(env.port, () =>
    console.log(`[api] http://localhost:${env.port}  (storage=${env.storage.driver}, payments=${env.payments.mode})`)
  );

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} – shutting down`);
    server.close();
    await Promise.allSettled([closeVideoQueue(), mongoose.disconnect()]);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[api] failed to start:', e.message);
  process.exit(1);
});
