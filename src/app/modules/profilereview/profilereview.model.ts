

// profilereview.model.ts
import { model, Schema } from 'mongoose';
import { IReport, IReview } from './profilereview.interface';

// ── Image Schema ──────────────────────────────────────────────────
const imageSchema = new Schema({
  id: { type: String, default: '' },
  url: { type: String, default: '' },
});

// ── Reply Schema ──────────────────────────────────────────────────
const replySchema = new Schema(
  {
    organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment:   { type: String, required: true, trim: true },
    isRead:    { type: Boolean, default: false }, // ✅ নতুন add
  },
  { timestamps: true }
);

// ── Review Schema ─────────────────────────────────────────────────
const ReviewSchema = new Schema<IReview>(
  {
    organizer:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating:      { type: Number, required: true, min: 1, max: 5 },
    comment:     { type: String, required: true, trim: true },
    image:       { type: imageSchema, default: null },
    isAnonymous: { type: Boolean, default: false },
    isDeleted:   { type: Boolean, default: false },
    reply:       { type: replySchema, default: null },
  },
  { timestamps: true }
);


ReviewSchema.pre(/^find/, function (next) {
  (this as any).where({ isDeleted: { $ne: true } });
  next();
});

// ── Report Schema ─────────────────────────────────────────────────
const ReportSchema = new Schema<IReport>(
  {
    review: {
      type: Schema.Types.ObjectId,
      ref: 'Review',
      required: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
  
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'resolved'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export const Review = model<IReview>('Review', ReviewSchema);
export const Report = model<IReport>('Report', ReportSchema);