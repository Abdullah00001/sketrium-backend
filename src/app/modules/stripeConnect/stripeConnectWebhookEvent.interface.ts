import { Types } from 'mongoose';

export type StripeConnectWebhookProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'MANUAL_RECONCILIATION_REQUIRED';

export interface IStripeConnectWebhookEvent {
  _id?: Types.ObjectId;
  stripeEventId: string;
  eventType: string;
  accountId?: string | null;
  livemode: boolean;
  processingStatus: StripeConnectWebhookProcessingStatus;
  attemptCount: number;
  lastError?: {
    code?: string;
    message?: string;
  } | null;
  processedAt?: Date | null;
  payload?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
