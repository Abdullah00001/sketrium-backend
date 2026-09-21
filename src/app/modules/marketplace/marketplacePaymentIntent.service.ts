import Stripe from 'stripe';
import { Types } from 'mongoose';
import config from '../../config';
import AppError from '../../error/AppError';
import { getStripeClient } from '../../utils/stripeClient';
import { Payment } from './marketplacePayment.model';
import { ReservationRecord } from './reservationRecord.model';
import { IPayment } from './marketplacePayment.interface';
import { marketplaceCheckoutService } from './marketplaceCheckout.service';

export type StripeErrorClassification = 'DEFINITIVE_STRIPE_FAILURE' | 'AMBIGUOUS_STRIPE_FAILURE';

/**
 * Classifies Stripe SDK errors according to approved Phase 4B rules.
 * Does NOT classify errors solely by HTTP status (e.g. 429 Rate Limit is retryable/ambiguous).
 */
export function classifyStripeError(err: any): StripeErrorClassification {
  const stripe = getStripeClient();

  if (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeAPIError ||
    err instanceof Stripe.errors.StripeRateLimitError ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET' ||
    err.code === 'EAI_AGAIN'
  ) {
    return 'AMBIGUOUS_STRIPE_FAILURE';
  }

  if (
    err instanceof Stripe.errors.StripeInvalidRequestError ||
    err instanceof Stripe.errors.StripeAuthenticationError ||
    err instanceof Stripe.errors.StripePermissionError ||
    err instanceof Stripe.errors.StripeCardError
  ) {
    return 'DEFINITIVE_STRIPE_FAILURE';
  }

  return 'AMBIGUOUS_STRIPE_FAILURE';
}

export class MarketplacePaymentIntentService {
  /**
   * Authoritative PaymentIntent Creation with Persistent Idempotency & Operation Locking.
   */
  public async createPaymentIntent(params: {
    paymentId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<{ paymentIntentId: string; clientSecret: string | null }> {
    const { paymentId, userId } = params;
    const paymentObjectId = new Types.ObjectId(paymentId);
    const userObjectId = new Types.ObjectId(userId);

    // 1. Load Payment & Assert Eligibility
    const payment = await Payment.findOne({ _id: paymentObjectId, userId: userObjectId });
    if (!payment) {
      throw new AppError(404, 'Marketplace Payment not found');
    }

    if (payment.engineVersion !== 'PHASE_4_MARKETPLACE') {
      throw new AppError(400, 'Invalid payment engine version');
    }

    if (payment.status !== 'PENDING') {
      throw new AppError(400, `Cannot create PaymentIntent for payment in status ${payment.status}`);
    }

    // Return existing client secret if already created
    if (
      payment.stripePaymentIntentOperationStatus === 'CREATED' &&
      payment.paymentIntentId
    ) {
      const stripe = getStripeClient();
      const existingPi = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
      return { paymentIntentId: existingPi.id, clientSecret: existingPi.client_secret };
    }

    // 2. Assert Reservations Exist & Are in RESERVED Status
    const reservations = await ReservationRecord.find({ paymentId: payment._id });
    if (reservations.length === 0) {
      throw new AppError(400, 'Cannot create PaymentIntent for payment with zero reservations');
    }

    const unreserved = reservations.find((r) => r.status !== 'RESERVED');
    if (unreserved) {
      throw new AppError(
        400,
        `Cannot create PaymentIntent: Reservation ${unreserved._id} is in status ${unreserved.status}`
      );
    }

    // 3. Construct Immutable Deterministic Stripe Idempotency Key
    const stripeIdempotencyKey = `pi_phase4_${payment._id.toString()}_${payment.checkoutFingerprint.substring(0, 16)}`;

    // 4. Atomically Acquire Operation Lock
    const lockedPayment = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: 'PENDING',
        stripePaymentIntentOperationStatus: { $in: ['NOT_STARTED', 'RECOVERY_REQUIRED'] },
      },
      {
        $set: {
          stripePaymentIntentOperationStatus: 'CREATING',
          stripeIdempotencyKey,
        },
      },
      { new: true }
    );

    if (!lockedPayment) {
      const current = await Payment.findById(payment._id);
      if (current?.stripePaymentIntentOperationStatus === 'CREATED' && current.paymentIntentId) {
        const stripe = getStripeClient();
        const existingPi = await stripe.paymentIntents.retrieve(current.paymentIntentId);
        return { paymentIntentId: existingPi.id, clientSecret: existingPi.client_secret };
      }
      if (current?.stripePaymentIntentOperationStatus === 'CREATING') {
        // Concurrent caller wait loop (up to 2000ms) for primary thread to finish creation
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retryPayment = await Payment.findById(payment._id);
          if (retryPayment?.stripePaymentIntentOperationStatus === 'CREATED' && retryPayment.paymentIntentId) {
            const stripe = getStripeClient();
            const existingPi = await stripe.paymentIntents.retrieve(retryPayment.paymentIntentId);
            return { paymentIntentId: existingPi.id, clientSecret: existingPi.client_secret };
          }
        }
        throw new AppError(409, 'PaymentIntent creation currently in progress by another thread');
      }
      throw new AppError(400, `PaymentIntent creation operation rejected for payment status ${current?.status}`);
    }

    // 5. Build Server-Only Metadata Payload (No Client Metadata Allowed)
    const metadata: Record<string, string> = {
      paymentId: payment._id.toString(),
      userId: payment.userId.toString(),
      environment: config.node_env || process.env.NODE_ENV || 'development',
      paymentType: payment.paymentType,
      platform: 'SKATRIUM_MARKETPLACE',
      engineVersion: 'PHASE_4_MARKETPLACE',
      checkoutFingerprint: payment.checkoutFingerprint,
    };

    // 6. Invoke Stripe PaymentIntent API with Persistent Idempotency Key
    const stripe = getStripeClient();
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: payment.amount,
          currency: payment.currency.toLowerCase(),
          metadata,
          automatic_payment_methods: { enabled: true },
        },
        {
          idempotencyKey: stripeIdempotencyKey,
        }
      );

      // Attach PaymentIntent ID & Mark CREATED
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            paymentIntentId: pi.id,
            stripePaymentIntentOperationStatus: 'CREATED',
          },
        }
      );

      return { paymentIntentId: pi.id, clientSecret: pi.client_secret };
    } catch (err: any) {
      const classification = classifyStripeError(err);

      if (classification === 'DEFINITIVE_STRIPE_FAILURE') {
        // Definitive Rejection -> Mark FAILED_DEFINITIVE, Payment CANCELED, release reservations
        await Payment.updateOne(
          { _id: payment._id },
          {
            $set: {
              stripePaymentIntentOperationStatus: 'FAILED_DEFINITIVE',
              status: 'CANCELED',
              canceledAt: new Date(),
            },
          }
        );

        for (const res of reservations) {
          await marketplaceCheckoutService.releaseReservation(res._id);
        }

        throw new AppError(400, `Stripe PaymentIntent creation failed definitively: ${err.message}`);
      } else {
        // Ambiguous Failure -> Mark RECOVERY_REQUIRED, preserve reservations & payment PENDING
        await Payment.updateOne(
          { _id: payment._id },
          {
            $set: {
              stripePaymentIntentOperationStatus: 'RECOVERY_REQUIRED',
            },
          }
        );

        throw new AppError(500, `Stripe PaymentIntent creation ambiguous failure: ${err.message}`);
      }
    }
  }

  /**
   * Safely retrieves client_secret for PENDING + CREATED payment.
   * Returns null for terminal / non-eligible payment states.
   */
  public async getClientSecret(
    paymentId: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<string | null> {
    const payment = await Payment.findOne({ _id: paymentId, userId });
    if (!payment) {
      throw new AppError(404, 'Marketplace Payment not found');
    }

    if (payment.status !== 'PENDING' || !payment.paymentIntentId) {
      return null;
    }

    const stripe = getStripeClient();
    const pi = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
    return pi.client_secret;
  }
}

export const marketplacePaymentIntentService = new MarketplacePaymentIntentService();
