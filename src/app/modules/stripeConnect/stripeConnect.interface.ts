import { Types } from 'mongoose';
import {
  AccountCreationStatus,
  StripeOnboardingStatus,
} from '../merchantProfile/merchantProfile.interface';

export type StripeSellerRole = 'MARCHANT' | 'ORGANIZER';

export interface IOnboardingTokenPayload {
  tokenId: string;
  userId: string;
  role: StripeSellerRole;
  profileId: string;
  expiresAt: number;
}

export interface IStripeStatusResponse {
  role: StripeSellerRole;
  stripeConnectedAccountId: string | null;
  accountCreationStatus: AccountCreationStatus;
  onboardingStatus: StripeOnboardingStatus;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersCapability: string;
  currentlyDue: string[];
  pastDue: string[];
  eventuallyDue: string[];
  disabledReason: string | null;
  stripeLastSyncedAt: Date | null;
}

export interface IOnboardResponse {
  url: string;
  accountCreationStatus: AccountCreationStatus;
  onboardingStatus: StripeOnboardingStatus;
  stripeConnectedAccountId: string;
}
