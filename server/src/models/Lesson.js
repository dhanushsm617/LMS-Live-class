import mongoose from 'mongoose';

export const VIDEO_STATUS = ['none', 'queued', 'processing', 'ready', 'failed'];

const renditionSchema = new mongoose.Schema(
  { name: String, height: Number, videoKbps: Number },
  { _id: false }
);

const lessonSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 4000 },
    section: { type: String, trim: true, default: 'Lessons' },
    order: { type: Number, default: 0 },
    isPreview: { type: Boolean, default: false }, // watchable without enrolling
    video: {
      status: { type: String, enum: VIDEO_STATUS, default: 'none' },
      progress: { type: Number, default: 0 }, // 0-100 while processing
      originalKey: String, // raw upload (storage key)
      hlsKey: String, // e.g. hls/<lessonId>/<version>/master.m3u8
      thumbnailKey: String,
      durationSec: { type: Number, default: 0 },
      renditions: [renditionSchema],
      jobId: String,
      error: String,
      processedAt: Date,
    },
  },
  { timestamps: true }
);

lessonSchema.index({ course: 1, order: 1 });

export default mongoose.model('Lesson', lessonSchema);
