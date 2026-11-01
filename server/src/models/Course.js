import mongoose from 'mongoose';
import crypto from 'node:crypto';

export const COURSE_STATUS = ['draft', 'pending', 'published', 'rejected', 'archived'];
export const LEVELS = ['beginner', 'intermediate', 'advanced'];

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, unique: true, index: true },
    subtitle: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, trim: true, default: 'General', index: true },
    level: { type: String, enum: LEVELS, default: 'beginner' },
    tags: [String],
    thumbnail: String,
    // Stored in the smallest currency unit (paise / cents). 0 = free.
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'inr' },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: COURSE_STATUS, default: 'draft', index: true },
    reviewNote: String,
    publishedAt: Date,
    // Denormalised counters, refreshed by services/courseStats.js
    lessonCount: { type: Number, default: 0 },
    durationSec: { type: Number, default: 0 },
    enrollmentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

courseSchema.index({ title: 'text', subtitle: 'text', tags: 'text' });

courseSchema.pre('validate', function makeSlug(next) {
  if (this.isNew && !this.slug) {
    this.slug = `${slugify(this.title) || 'course'}-${crypto.randomBytes(3).toString('hex')}`;
  }
  next();
});

export default mongoose.model('Course', courseSchema);
