import mongoose from 'mongoose';

const certificateSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true }, // public verification code
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    // Snapshot so a certificate stays valid even if names / titles change later
    studentName: { type: String, required: true },
    courseTitle: { type: String, required: true },
    instructorName: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

certificateSchema.index({ student: 1, course: 1 }, { unique: true });

export default mongoose.model('Certificate', certificateSchema);
