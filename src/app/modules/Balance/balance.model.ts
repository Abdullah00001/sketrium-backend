import { Schema, model, Document, Types } from 'mongoose';

export interface IDriverProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId; // Changed to ObjectId
  currentBalance: number;
  stripeAccountId: string | null;
  stripeOnboarded: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const balanceSchema = new Schema<IDriverProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // Added ObjectId and unique
    currentBalance: { type: Number, default: 0, min: 0 }, // Added min: 0 to prevent negative balance
    stripeAccountId: { type: String, default: null },
    stripeOnboarded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const BalanceModel = model<IDriverProfile>('Balance', balanceSchema);