import { Schema, model } from 'mongoose';
import { IPayment, IPaymentAllocation } from './marketplacePayment.interface';

const paymentAllocationSchema = new Schema<IPaymentAllocation>(
  {
    allocationId: { type: String, required: true },
    sellerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerRole: { type: String, enum: ['MARCHANT', 'MERCHANT', 'ORGANIZER'], required: true },
    stripeConnectedAccountId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }, // In minor integer units (cents)
    currency: { type: String, required: true },
    transferStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RECONCILIATION_REQUIRED', 'REVERSED'],
      default: 'PENDING',
    },
    stripeTransferId: { type: String, default: null },
    transferError: { type: String, default: null },
    transferredAt: { type: Date, default: null },
    sourceInfo: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientCheckoutIdempotencyKey: { type: String, required: true },
    checkoutFingerprint: { type: String, required: true },
    engineVersion: {
      type: String,
      enum: ['PHASE_4_MARKETPLACE'],
      default: 'PHASE_4_MARKETPLACE',
      required: true,
    },
    paymentType: {
      type: String,
      enum: ['PRODUCT_CART', 'EVENT_TICKET'],
      required: true,
    },
    paymentIntentId: { type: String, default: undefined },
    stripeIdempotencyKey: { type: String, default: undefined },
    stripePaymentIntentOperationStatus: {
      type: String,
      enum: ['NOT_STARTED', 'CREATING', 'CREATED', 'RECOVERY_REQUIRED', 'FAILED_DEFINITIVE'],
      default: 'NOT_STARTED',
    },
    reconciliationReason: {
      type: String,
      enum: [
        'STRIPE_API_UNCERTAIN',
        'PAYMENT_INTENT_CREATION_UNCERTAIN',
        'DATABASE_PERSISTENCE_FAILURE',
        'WEBHOOK_PROCESSING_FAILURE',
        'RESERVATION_CONFIRMATION_FAILURE',
        'AMOUNT_MISMATCH',
        'CURRENCY_MISMATCH',
        'METADATA_MISMATCH',
        'OWNERSHIP_MISMATCH',
        'RESERVATION_ALREADY_RELEASED',
        'PROCESSING_MAX_DURATION_EXCEEDED',
        'UNKNOWN',
      ],
      default: null,
    },
    currency: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }, // In minor integer units (cents)
    status: {
      type: String,
      enum: [
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'CANCELED',
        'EXPIRED',
        'RECONCILIATION_REQUIRED',
      ],
      default: 'PENDING',
    },
    allocations: [paymentAllocationSchema],
    stripeLastEventCreatedAt: { type: Date, default: null },
    succeededAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    purchasedCartItemIds: [{ type: Schema.Types.ObjectId }],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Business Checkout Idempotency Constraint
paymentSchema.index(
  { userId: 1, clientCheckoutIdempotencyKey: 1 },
  { unique: true }
);

paymentSchema.index({ checkoutFingerprint: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ status: 1, createdAt: 1 });
paymentSchema.index({ paymentIntentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ stripeIdempotencyKey: 1 }, { unique: true, sparse: true });

export const Payment = model<IPayment>('MarketplacePayment', paymentSchema);
