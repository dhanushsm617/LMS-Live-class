import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  // Older versions of Enrollment used `user`; the current model uses `student`.
  // Keep the current student/course unique index and remove the obsolete index,
  // which otherwise collides on documents where the legacy `user` field is absent.
  const db = mongoose.connection.db;
  const hasEnrollments = await db.listCollections({ name: 'enrollments' }, { nameOnly: true }).hasNext();
  if (hasEnrollments) {
    const indexes = await db.collection('enrollments').indexes();
    if (indexes.some((index) => index.name === 'user_1_course_1')) {
      try {
        await db.collection('enrollments').dropIndex('user_1_course_1');
        console.log('[db] removed obsolete enrollment index user_1_course_1');
      } catch (error) {
        // Another local process may have removed it during startup.
        if (error.code !== 27) throw error;
      }
    }
  }
  console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
}
