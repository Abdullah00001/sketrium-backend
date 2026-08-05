import { Schema, model, Document, Types } from 'mongoose';

export type WithdrawalStatus = 'PENDING' | 'COMPLETED' | 'REJECTED';

export interface IWithdrawal extends Document {
  _id: Types.ObjectId;
  driverProfileId: Types.ObjectId;
  amount: number;
  status: WithdrawalStatus;
  stripeTransferId: string | null;
  processedBy: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalSchema = new Schema<IWithdrawal>(
  {
    driverProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'Balance', // Fixed reference to Balance model
      required: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'REJECTED'],
      default: 'PENDING',
    },
    stripeTransferId: { type: String, default: null },
    processedBy: { type: String, default: null }, // Usually reference to admin User ID
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WithdrawalModel = model<IWithdrawal>('Withdrawal', withdrawalSchema);