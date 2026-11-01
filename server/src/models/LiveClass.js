import mongoose from 'mongoose';
import crypto from 'node:crypto';

const liveClassSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 2000 },
    scheduledAt: { type: Date, required: true, index: true },
    durationMin: { type: Number, default: 60, min: 5, max: 480 },
    status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled', index: true },
    roomName: { type: String, unique: true, default: () => `lms-${crypto.randomBytes(8).toString('hex')}` },
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('LiveClass', liveClassSchema);
