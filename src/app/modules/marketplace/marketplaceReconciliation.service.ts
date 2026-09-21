import mongoose, { Types } from 'mongoose';
import logger from '../../configs/logger.configs';
import AppError from '../../error/AppError';
import { getStripeClient } from '../../utils/stripeClient';
import { Payment } from './marketplacePayment.model';
import { ReservationRecord } from './reservationRecord.model';
import { IPayment, ReconciliationReason } from './marketplacePayment.interface';
import { marketplaceCheckoutService } from './marketplaceCheckout.service';
import { marketplaceWebhookService } from './marketplaceWebhook.service';

export const AUTOMATIC_RECONCILIATION_REASONS: ReconciliationReason[] = [
  'STRIPE_API_UNCERTAIN',
  'PAYMENT_INTENT_CREATION_UNCERTAIN',
  'DATABASE_PERSISTENCE_FAILURE',
  'WEBHOOK_PROCESSING_FAILURE',
];

export const MANUAL_RECONCILIATION_REASONS: ReconciliationReason[] = [
  'RESERVATION_CONFIRMATION_FAILURE',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'METADATA_MISMATCH',
  'OWNERSHIP_MISMATCH',
  'RESERVATION_ALREADY_RELEASED',
  'PROCESSING_MAX_DURATION_EXCEEDED',
  'UNKNOWN',
];

export class MarketplaceReconciliationService {
  /**
   * Durable Reconciliation Processor for RECONCILIATION_REQUIRED Payments.
   */
  public async reconcilePayment(paymentId: string | Types.ObjectId): Promise<{
    paymentId: string;
    reconciled: boolean;
    reason: string;
  }> {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new AppError(404, 'Payment not found');
    }

    if (payment.status !== 'RECONCILIATION_REQUIRED') {
      return { paymentId: payment._id.toString(), reconciled: false, reason: `Payment status is ${payment.status}, not RECONCILIATION_REQUIRED` };
    }

    const reason = payment.reconciliationReason || 'UNKNOWN';

    // Enforcement: MANUAL reconciliation reasons MUST NOT be automatically fulfilled!
    if (MANUAL_RECONCILIATION_REASONS.includes(reason)) {
      logger.warn(`Marketplace Reconciliation: Manual review mandatory for payment ${payment._id} (Reason: ${reason}). Automatic fulfillment blocked.`);
      return { paymentId: payment._id.toString(), reconciled: false, reason: `Manual review required for ${reason}` };
    }

    if (!payment.paymentIntentId) {
      return { paymentId: payment._id.toString(), reconciled: false, reason: 'No paymentIntentId attached for automatic recovery' };
    }

    // Authoritative Stripe API Retrieval
    const stripe = getStripeClient();
    const pi = await stripe.paymentIntents.retrieve(payment.paymentIntentId);

    if (pi.status === 'succeeded') {
      // Simulate webhook event delivery for authoritative confirmation
      await marketplaceWebhookService.handlePaymentIntentSucceeded({
        stripeEventId: `recon_evt_${Date.now()}`,
        payload: {
          id: `recon_evt_${Date.now()}`,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          livemode: pi.livemode,
          objectId: pi.id,
          objectType: 'payment_intent',
        },
        rawEvent: {
          created: Math.floor(Date.now() / 1000),
          data: { object: pi },
        },
      });

      return { paymentId: payment._id.toString(), reconciled: true, reason: 'Reconciled to SUCCEEDED' };
    }

    if (['canceled', 'requires_payment_method'].includes(pi.status)) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'FAILED', failedAt: new Date(), reconciliationReason: null } }
      );
      const reservations = await ReservationRecord.find({ paymentId: payment._id });
      for (const res of reservations) {
        await marketplaceCheckoutService.releaseReservation(res._id);
      }

      return { paymentId: payment._id.toString(), reconciled: true, reason: 'Reconciled to FAILED and released' };
    }

    return { paymentId: payment._id.toString(), reconciled: false, reason: `Stripe PI status is still ${pi.status}` };
  }

  /**
   * Sweeps all RECONCILIATION_REQUIRED payments with automatic reasons.
   */
  public async processAutomaticReconciliationQueue(): Promise<number> {
    const candidatePayments = await Payment.find({
      status: 'RECONCILIATION_REQUIRED',
      reconciliationReason: { $in: AUTOMATIC_RECONCILIATION_REASONS },
    });

    let reconciledCount = 0;
    for (const payment of candidatePayments) {
      try {
        const res = await this.reconcilePayment(payment._id);
        if (res.reconciled) reconciledCount++;
      } catch (err: any) {
        logger.error(`Automatic reconciliation error for payment ${payment._id}:`, err);
      }
    }

    return reconciledCount;
  }
}

export const marketplaceReconciliationService = new MarketplaceReconciliationService();
