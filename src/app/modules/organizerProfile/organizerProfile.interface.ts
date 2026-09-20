import { Types } from 'mongoose';
import {
  AccountCreationStatus,
  StripeOnboardingStatus,
} from '../merchantProfile/merchantProfile.interface';

export interface IOrganizerProfile {
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
  stripeLastEventCreatedAt?: Date | null;

  organizerLegalLink?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
