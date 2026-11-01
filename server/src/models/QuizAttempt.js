import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    answers: [
      {
        _id: false,
        question: mongoose.Schema.Types.ObjectId,
        selected: [Number],
      },
    ],
    results: [
      {
        _id: false,
        question: mongoose.Schema.Types.ObjectId,
        correct: Boolean,
        earned: Number,
      },
    ],
    score: Number,
    maxScore: Number,
    percent: Number,
    passed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

attemptSchema.index({ quiz: 1, student: 1, createdAt: -1 });

export default mongoose.model('QuizAttempt', attemptSchema);
