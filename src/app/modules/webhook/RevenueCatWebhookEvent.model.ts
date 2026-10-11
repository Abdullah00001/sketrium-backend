import { Schema, model } from 'mongoose';

const revenueCatWebhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    appUserId: { type: String },
    environment: { type: String },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const RevenueCatWebhookEvent = model(
  'RevenueCatWebhookEvent',
  revenueCatWebhookEventSchema,
);
