export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface ISanitizedStripeSnapshot {
  id: string;
  type: string;
  apiVersion?: string;
  created: number;
  livemode: boolean;
  account?: string;
  objectId?: string;
  objectType?: string;
  metadata?: Record<string, any>;
  amount?: number;
  currency?: string;
  status?: string;
}

export interface IStripeStructuredError {
  code?: string;
  message?: string;
  category?: string;
}

export interface IStripeWebhookEvent {
  stripeEventId: string;
  eventType: string;
  apiVersion?: string;
  livemode: boolean;
  stripeAccountId?: string;
  stripeObjectId?: string;
  stripeCreatedAt: Date;
  payload: ISanitizedStripeSnapshot;
  processingStatus: ProcessingStatus;
  receivedAt: Date;
  lastAttemptAt?: Date;
  processedAt?: Date;
  failedAt?: Date;
  attemptCount: number;
  error?: IStripeStructuredError;
}
