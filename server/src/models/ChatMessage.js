import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    liveClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    role: { type: String, enum: ['student', 'instructor', 'admin'], required: true },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatSchema.index({ liveClass: 1, createdAt: -1 });

export default mongoose.model('ChatMessage', chatSchema);
