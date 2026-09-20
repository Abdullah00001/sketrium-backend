import { model, Schema } from 'mongoose';
import { IOrganizerProfile } from './organizerProfile.interface';

const OrganizerProfileSchema = new Schema<IOrganizerProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    stripeConnectedAccountId: {
      type: String,
    },
    accountCreationOperationId: {
      type: String,
    },
    stripeIdempotencyKey: {
      type: String,
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
    stripeLastEventCreatedAt: {
      type: Date,
      default: null,
    },
    organizerLegalLink: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Unique sparse indexes
OrganizerProfileSchema.index(
  { stripeConnectedAccountId: 1 },
  { unique: true, sparse: true },
);
OrganizerProfileSchema.index(
  { accountCreationOperationId: 1 },
  { unique: true, sparse: true },
);

export const OrganizerProfile = model<IOrganizerProfile>(
  'OrganizerProfile',
  OrganizerProfileSchema,
);
