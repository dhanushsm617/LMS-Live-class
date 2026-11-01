import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema(
  {
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    seconds: { type: Number, default: 0 }, // resume point
    maxSeconds: { type: Number, default: 0 }, // furthest point reached
    updatedAt: Date,
  },
  { _id: false }
);

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    source: { type: String, enum: ['free', 'paid', 'admin'], default: 'free' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
    positions: [positionSchema],
    lastLesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    percent: { type: Number, default: 0 },
    completedAt: Date,
    certificate: { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

export default mongoose.model('Enrollment', enrollmentSchema);
