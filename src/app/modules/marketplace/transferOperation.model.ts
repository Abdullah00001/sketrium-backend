import { Schema, model } from 'mongoose';
import { ITransferOperation, IStripeReversalItem } from './transferOperation.interface';

const stripeReversalItemSchema = new Schema<IStripeReversalItem>(
  {
    stripeReversalId: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const transferOperationSchema = new Schema<ITransferOperation>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    allocationId: { type: String, required: true, trim: true },
    sellerUserId: { type: Schema.Types.ObjectId, required: true },
    sellerRole: { type: String, enum: ['MARCHANT', 'MERCHANT', 'ORGANIZER'], required: true },
    stripeConnectedAccountId: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: [
        'NOT_STARTED',
        'CREATING',
        'CREATED',
        'RECOVERY_REQUIRED',
        'FAILED_DEFINITIVE',
        'RECONCILIATION_REQUIRED',
        'REVERSED',
      ],
      default: 'NOT_STARTED',
      required: true,
    },
    stripeIdempotencyKey: { type: String, required: true, trim: true },
    stripeTransferId: { type: String, default: null, trim: true },
    transferCreatedAt: { type: Date, default: null },
    lockVersion: { type: Number, default: 0, required: true },
    attemptCount: { type: Number, default: 0, required: true },
    lastAttemptAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    reconciliationReason: { type: String, default: null },
    executionSkipReason: { type: String, enum: ['ZERO_AMOUNT'], default: null },
    originalAmount: { type: Number, required: true },
    reversedAmount: { type: Number, default: 0, required: true },
    remainingAmount: { type: Number, required: true },
    reconciliationState: {
      type: String,
      enum: ['NONE', 'PARTIALLY_REVERSED', 'FULLY_REVERSED', 'RECONCILIATION_REQUIRED'],
      default: 'NONE',
      required: true,
    },
    reversals: { type: [stripeReversalItemSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: One TransferOperation per (paymentId, allocationId)
transferOperationSchema.index({ paymentId: 1, allocationId: 1 }, { unique: true });

// Query optimization indexes
transferOperationSchema.index({ status: 1, nextRetryAt: 1 });
transferOperationSchema.index({ stripeTransferId: 1 });

export const TransferOperation = model<ITransferOperation>(
  'TransferOperation',
  transferOperationSchema
);
