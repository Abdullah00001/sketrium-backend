import { model, Schema } from 'mongoose';
import { SubscriptionPlanModel, TSubscriptionPlan } from './subplan.interface';

// ─── Schema ──────────────────────────────────────────────────────────────────
const SubscriptionPlanSchema = new Schema<TSubscriptionPlan, SubscriptionPlanModel>(
  {
    name: {
      type: String,
      enum: ['free','starter', 'pro'],
      required: true,
      
    },
   role: {
      type: String,
      enum: ["ORGANIZER", "MARCHANT", "KAATEDJ"],
      required: true,
    },
  
    description: {
      type: String,
   
    },
    price: {
      type: Number,
      required: true, // cents e.g. 2999 = $29.99
    },
    currency: {
      type: String,
      default: 'usd',
    },
    interval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month',
    },
    trialMonths: {
      type: Number,
      default: 1,
    },
    stripePriceId: {
      type: String,
      required: true,
    },
    features: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Model ───────────────────────────────────────────────────────────────────
const SubscriptionPlan = model<TSubscriptionPlan, SubscriptionPlanModel>(
  'SubscriptionPlan',
  SubscriptionPlanSchema,
);

export default SubscriptionPlan;