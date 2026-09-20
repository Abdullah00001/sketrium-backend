import { model, Schema } from 'mongoose';
import { IMerchantProfile } from './merchantProfile.interface';

const MerchantProfileSchema = new Schema<IMerchantProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    stripeConnectedAccountId: {
      type: String,
      default: null,
    },
    accountCreationOperationId: {
      type: String,
      default: null,
    },
    stripeIdempotencyKey: {
      type: String,
      default: null,
    },
    accountCreationStatus: {
      type: String,
      enum: [
        'NOT_STARTED',
        'CREATING',
        'CREATED',
        'FAILED',
        'RECOVERY_REQUIRED',
        'MANUAL_RECONCILIATION_REQUIRED',
      ],
      default: 'NOT_STARTED',
    },
    accountCreationStartedAt: {
      type: Date,
      default: null,
    },
    accountCreationLastAttemptAt: {
      type: Date,
      default: null,
    },
    accountCreationLastError: {
      type: Schema.Types.Mixed,
      default: null,
    },
    creationAttemptCount: {
      type: Number,
      default: 0,
    },
    onboardingStatus: {
      type: String,
      enum: [
        'NOT_CREATED',
        'ONBOARDING_REQUIRED',
        'UNDER_REVIEW',
        'READY',
        'RESTRICTED',
        'DISABLED',
        'STATUS_EVALUATION_ERROR',
      ],
      default: 'NOT_CREATED',
    },
    detailsSubmitted: {
      type: Boolean,
      default: false,
    },
    payoutsEnabled: {
      type: Boolean,
      default: false,
    },
    transfersCapability: {
      type: String,
      default: 'inactive',
    },
    currentlyDue: {
      type: [String],
      default: [],
    },
    pastDue: {
      type: [String],
      default: [],
    },
    eventuallyDue: {
      type: [String],
      default: [],
    },
    disabledReason: {
      type: String,
      default: null,
    },
    stripeLastSyncedAt: {
      type: Date,
      default: null,
    },
    merchantLegalLink: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Unique sparse indexes
MerchantProfileSchema.index(
  { stripeConnectedAccountId: 1 },
  { unique: true, sparse: true },
);
MerchantProfileSchema.index(
  { accountCreationOperationId: 1 },
  { unique: true, sparse: true },
);

export const MerchantProfile = model<IMerchantProfile>(
  'MerchantProfile',
  MerchantProfileSchema,
);
