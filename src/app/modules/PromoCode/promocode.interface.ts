import { Model, Types } from 'mongoose';

// ─── PromoCode Type ───────────────────────────────────────────────────────────
export type TPromoCode = {
  _id?: Types.ObjectId;
  code: string;
  plan: Types.ObjectId;
  trialMonths: number;
  usedBy?: Types.ObjectId | null;
  isUsed: boolean;
  expiresAt?: Date;
  createdBy: Types.ObjectId;
  isActive: boolean;
};

// ─── Model Type ───────────────────────────────────────────────────────────────
export type PromoCodeModel = Model<TPromoCode>;