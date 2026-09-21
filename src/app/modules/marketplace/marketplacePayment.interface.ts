import { Document, Types } from 'mongoose';

export type EngineVersion = 'PHASE_4_MARKETPLACE';

export type PaymentType = 'PRODUCT_CART' | 'EVENT_TICKET';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'RECONCILIATION_REQUIRED';

export type StripePaymentIntentOperationStatus =
  | 'NOT_STARTED'
  | 'CREATING'
  | 'CREATED'
  | 'RECOVERY_REQUIRED'
  | 'FAILED_DEFINITIVE';

export type ReconciliationReason =
  | 'STRIPE_API_UNCERTAIN'
  | 'PAYMENT_INTENT_CREATION_UNCERTAIN'
  | 'DATABASE_PERSISTENCE_FAILURE'
  | 'WEBHOOK_PROCESSING_FAILURE'
  | 'RESERVATION_CONFIRMATION_FAILURE'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'METADATA_MISMATCH'
  | 'OWNERSHIP_MISMATCH'
  | 'RESERVATION_ALREADY_RELEASED'
  | 'PROCESSING_MAX_DURATION_EXCEEDED'
  | 'UNKNOWN';

export type TransferStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED'
  | 'REVERSED';

export interface IPaymentAllocation {
  allocationId: string;
  sellerUserId: Types.ObjectId;
  sellerRole: 'MARCHANT' | 'MERCHANT' | 'ORGANIZER';
  stripeConnectedAccountId: string;
  amount: number; // Integer minor units (cents)
  currency: string;
  transferStatus: TransferStatus;
  stripeTransferId?: string | null;
  transferError?: string | null;
  transferredAt?: Date | null;
  sourceInfo?: {
    productId?: Types.ObjectId;
    productName?: string;
    quantity?: number;
    itemsSubtotal?: number;
    shippingFee?: number;
    eventId?: Types.ObjectId;
  };
}

export interface IPayment extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clientCheckoutIdempotencyKey: string;
  checkoutFingerprint: string;
  engineVersion: EngineVersion;
  paymentType: PaymentType;
  paymentIntentId?: string | null;
  stripeIdempotencyKey?: string | null;
  stripePaymentIntentOperationStatus?: StripePaymentIntentOperationStatus;
  reconciliationReason?: ReconciliationReason | null;
  currency: string;
  amount: number; // Integer minor units (cents)
  status: PaymentStatus;
  allocations: IPaymentAllocation[];
  stripeLastEventCreatedAt?: Date | null;
  succeededAt?: Date | null;
  failedAt?: Date | null;
  canceledAt?: Date | null;
  purchasedCartItemIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
