import { Schema, model } from 'mongoose';
import { IPendingWebSubscription } from './PendingWebSubscription.interface';

const pendingWebSubscriptionSchema = new Schema<IPendingWebSubscription>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    plan_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'PAYMENT_COMPLETED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_EXPIRED'],
      default: 'ACTIVE',
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

export const PendingWebSubscription = model<IPendingWebSubscription>(
  'PendingWebSubscription',
  pendingWebSubscriptionSchema
);
