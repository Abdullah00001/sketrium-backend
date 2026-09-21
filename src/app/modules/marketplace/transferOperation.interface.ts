import { Document, Types } from 'mongoose';

export type TransferOperationStatus =
  | 'NOT_STARTED'
  | 'CREATING'
  | 'CREATED'
  | 'RECOVERY_REQUIRED'
  | 'FAILED_DEFINITIVE'
  | 'RECONCILIATION_REQUIRED'
  | 'REVERSED';

export type TransferReconciliationState =
  | 'NONE'
  | 'PARTIALLY_REVERSED'
  | 'FULLY_REVERSED'
  | 'RECONCILIATION_REQUIRED';

export interface IStripeReversalItem {
  stripeReversalId: string;
  amount: number;
  reason?: string;
  createdAt: Date;
}

export interface ITransferOperation extends Document {
  paymentId: Types.ObjectId;
  allocationId: string;
  sellerUserId: Types.ObjectId;
  sellerRole: 'MARCHANT' | 'MERCHANT' | 'ORGANIZER';
  stripeConnectedAccountId: string;
  amount: number;
  currency: string;
  status: TransferOperationStatus;
  stripeIdempotencyKey: string;
  stripeTransferId?: string | null;
  transferCreatedAt?: Date | null;
  lockVersion: number;
  attemptCount: number;
  lastAttemptAt?: Date | null;
  nextRetryAt?: Date | null;
  failureReason?: string | null;
  reconciliationReason?: string | null;
  executionSkipReason?: 'ZERO_AMOUNT' | null;
  originalAmount: number;
  reversedAmount: number;
  remainingAmount: number;
  reconciliationState: TransferReconciliationState;
  reversals: IStripeReversalItem[];
  createdAt: Date;
  updatedAt: Date;
}
