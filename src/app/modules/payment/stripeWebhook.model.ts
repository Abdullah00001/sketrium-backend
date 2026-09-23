import { Schema, model } from 'mongoose';
import { IStripeWebhookEvent } from './stripeWebhook.interface';

const stripeWebhookEventSchema = new Schema<IStripeWebhookEvent>(
  {
    stripeEventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    apiVersion: { type: String, required: false },
    livemode: { type: Boolean, required: true },
    stripeAccountId: { type: String, required: false },
    stripeObjectId: { type: String, required: false, index: true },
    stripeCreatedAt: { type: Date, required: true },
    payload: {
      id: { type: String, required: true },
      type: { type: String, required: true },
      apiVersion: { type: String },
      created: { type: Number, required: true },
      livemode: { type: Boolean, required: true },
      account: { type: String },
      objectId: { type: String },
      objectType: { type: String },
      metadata: { type: Schema.Types.Mixed },
    },
    processingStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    receivedAt: { type: Date, default: Date.now, required: true, index: true },
    lastAttemptAt: { type: Date, required: false },
    processedAt: { type: Date, required: false },
    failedAt: { type: Date, required: false },
    attemptCount: { type: Number, default: 0, required: true },
    error: {
      code: { type: String },
      message: { type: String },
      category: { type: String },
    },
  },
  { timestamps: true }
);

export const StripeWebhookEvent = model<IStripeWebhookEvent>(
  'StripeWebhookEvent',
  stripeWebhookEventSchema
);
