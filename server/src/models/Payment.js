import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true }, // minor units
    currency: { type: String, default: 'inr' },
    platformFee: { type: Number, required: true },
    instructorEarnings: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending', index: true },
    provider: { type: String, enum: ['stripe', 'mock'], required: true },
    providerSessionId: { type: String, index: true, sparse: true },
    providerPaymentIntentId: { type: String, index: true, sparse: true },
    paidAt: Date,
  },
  { timestamps: true }
);

paymentSchema.index({ instructor: 1, status: 1, paidAt: -1 });

export default mongoose.model('Payment', paymentSchema);
