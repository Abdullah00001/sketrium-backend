
import { model, Schema } from 'mongoose';
import { PaymentHistoryModel, TPaymentHistory } from './subpayment.interface';

// ─── Schema ───────────────────────────────────────────────────────────────────
const PaymentHistorySchema = new Schema<TPaymentHistory, PaymentHistoryModel>(
  {
     
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
     
    plan: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: false, 
    },
    promoCode: {
      type: Schema.Types.ObjectId,
      ref: 'PromoCode',
      default: null,
    },

     
    stripeSessionId: {
      type: String,
      unique: true,
      sparse: true, 
    },
    stripeSubscriptionId: { type: String },
    stripeInvoiceId: { type: String },

     
    appleOriginalTransactionId: { type: String, index: true },  
    appleLatestTransactionId: { type: String, index: true },   
    appleReceiptData: { type: String },                         

  
    googlePurchaseToken: { type: String, index: true },      
    googleOrderId: { type: String, index: true },            

   
    productId: {
      type: String,
      index: true, // স্টোরের প্ল্যান আইডি (যেমন: "core_monthly", "pro_yearly")
    },
    entitlement: { 
      type: String, 
      index: true, // অ্যাপের ভেতর কি ফিচার আনলক হবে (যেমন: "premium_access")
    }, 

     
    store: {
      type: String,
      enum: ['STRIPE', 'APP_STORE', 'PLAY_STORE'], 
      default: 'STRIPE',
      index: true,
    },

    
    amount: {
      type: Number,
      required: false, 
      default: 0, // সেন্টস (Cents) এ হিসাব হবে
    },
    currency: {
      type: String,
      default: 'usd',
    },

   
    status: {
      type: String,
      enum: [
        'pending',
        'succeeded',
        'failed',
        'refunded',
        'active',
        'expired',
        'cancelled',
        'grace_period'
      ], 
      default: 'pending',
      index: true,
    },

     
    isTrial: {
      type: Boolean,
      default: false,
    },
    trialDays: {
      type: Number,
      default: 0,
    },
    paidAt: {
      type: Date,
    },
    expiredAt: {
      type: Date,
      index: true, // সাবস্ক্রিপশনের মেয়াদ ঠিক কবে শেষ হবে তার ডেট
    },

    
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Model ────────────────────────────────────────────────────────────────────
const PaymentHistory = model<TPaymentHistory, PaymentHistoryModel>(
  'PaymentHistory',
  PaymentHistorySchema,
);

export default PaymentHistory;