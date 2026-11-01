import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  { text: { type: String, required: true, trim: true }, isCorrect: { type: Boolean, default: false } },
  { _id: false }
);

const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true },
  type: { type: String, enum: ['single', 'multiple', 'truefalse'], default: 'single' },
  options: { type: [optionSchema], validate: (v) => v.length >= 2 },
  points: { type: Number, default: 1, min: 1 },
  explanation: { type: String, default: '' },
});

const quizSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }, // optional: attach after a lesson
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, default: '' },
    passPercent: { type: Number, default: 60, min: 1, max: 100 },
    maxAttempts: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    required: { type: Boolean, default: true }, // must pass to complete the course
    questions: [questionSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Quiz', quizSchema);
