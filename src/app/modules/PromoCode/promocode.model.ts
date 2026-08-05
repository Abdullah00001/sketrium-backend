import { model, Schema } from 'mongoose';
import { PromoCodeModel, TPromoCode } from './promocode.interface';


// ─── Schema ───────────────────────────────────────────────────────────────────
const PromoCodeSchema = new Schema<TPromoCode, PromoCodeModel>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    plan: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
   // ✅ এটা দাও
trialMonths: {
  type: Number,
  required: true,
  default: 1,
},
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Model ────────────────────────────────────────────────────────────────────
const PromoCode = model<TPromoCode, PromoCodeModel>('PromoCode', PromoCodeSchema);

export default PromoCode;