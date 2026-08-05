

import { Types ,Model} from 'mongoose';

import mongoose from "mongoose";




// ─── Checkout Session Payload ─────────────────────────────────────────────────
export type TCreateCheckoutPayload = {
  planId: string;
  promoCode?: string;
  successUrl?: string;
  cancelUrl?: string;
};
 
// ─── Subscription Status ──────────────────────────────────────────────────────
export type TSubscriptionStatus = 'active' | 'trialing' | 'expired' | 'cancelled' | 'none';
 
 
// ─── Payment Status ───────────────────────────────────────────────────────────
export type TPaymentStatus = 'succeeded' | 'failed' | 'pending' | 'refunded';
 

export type TPaymentHistory = {
  user: mongoose.Types.ObjectId;
  plan?: mongoose.Types.ObjectId;
  promoCode?: mongoose.Types.ObjectId | null;
  
  stripeSessionId?: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  
  // Apple Fields:
  appleOriginalTransactionId?: string;
  appleLatestTransactionId?: string;
  appleReceiptData?: string;
  
  // Google Fields:
  googlePurchaseToken?: string;
  googleOrderId?: string;
  
  // Common Mobile & Tracking:
  productId?: string;
  entitlement?: string;
  store: 'STRIPE' | 'APP_STORE' | 'PLAY_STORE';
  
  amount?: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'active' | 'expired' | 'cancelled' | 'grace_period';
  isTrial: boolean;
  trialDays: number;
  paidAt?: Date;
  expiredAt?: Date;
  isDeleted: boolean;
};

export type PaymentHistoryModel = Model<TPaymentHistory>;