import { model, Schema } from 'mongoose';
import { IStripeConnectWebhookEvent } from './stripeConnectWebhookEvent.interface';

const StripeConnectWebhookEventSchema = new Schema<IStripeConnectWebhookEvent>(
  {
    stripeEventId: {
      type: String,
      required: true,
      unique: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    accountId: {
      type: String,
      default: null,
    },
    livemode: {
      type: Boolean,
      default: false,
    },
    processingStatus: {
      type: String,
      enum: [
        'PENDING',
        'PROCESSING',
        'SUCCESS',
        'FAILED',
        'MANUAL_RECONCILIATION_REQUIRED',
      ],
      default: 'PENDING',
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: Schema.Types.Mixed,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

StripeConnectWebhookEventSchema.index({ accountId: 1, processingStatus: 1 });

export const StripeConnectWebhookEvent = model<IStripeConnectWebhookEvent>(
  'StripeConnectWebhookEvent',
  StripeConnectWebhookEventSchema,
);
