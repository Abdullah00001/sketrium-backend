import { Types } from 'mongoose';

export type AccountCreationStatus =
  | 'NOT_STARTED'
  | 'CREATING'
  | 'CREATED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED'
  | 'MANUAL_RECONCILIATION_REQUIRED';

export type StripeOnboardingStatus =
  | 'NOT_CREATED'
  | 'ONBOARDING_REQUIRED'
  | 'UNDER_REVIEW'
  | 'READY'
  | 'RESTRICTED'
  | 'DISABLED'
  | 'STATUS_EVALUATION_ERROR';

export interface IMerchantProfile {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  stripeConnectedAccountId?: string | null;
  
  // Persistent Operation Idempotency
  accountCreationOperationId?: string | null;
  stripeIdempotencyKey?: string | null;
  accountCreationStatus: AccountCreationStatus;
  accountCreationStartedAt?: Date | null;
  accountCreationLastAttemptAt?: Date | null;
  accountCreationLastError?: {
    code?: string;
    message?: string;
  } | null;
  creationAttemptCount: number;

  // Stripe Account Readiness State & Telemetry
  onboardingStatus: StripeOnboardingStatus;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersCapability: string; // 'active' | 'inactive' | 'pending'
  currentlyDue: string[];
  pastDue: string[];
  eventuallyDue: string[];
  disabledReason?: string | null;
  stripeLastSyncedAt?: Date | null;

  merchantLegalLink?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
