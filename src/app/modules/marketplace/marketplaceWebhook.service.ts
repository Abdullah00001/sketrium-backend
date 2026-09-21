import Stripe from 'stripe';
import mongoose, { Types } from 'mongoose';
import config from '../../config';
import logger from '../../configs/logger.configs';
import { stripeEventDispatcher } from '../payment/stripeWebhook.dispatcher';
import { ISanitizedStripeSnapshot } from '../payment/stripeWebhook.interface';
import { Payment } from './marketplacePayment.model';
import { ReservationRecord } from './reservationRecord.model';
import { Cart } from '../addtocard/addtotocard.model';
import { IPayment, ReconciliationReason } from './marketplacePayment.interface';
import { marketplaceCheckoutService } from './marketplaceCheckout.service';
import { enqueueReconciliationJob } from '../../jobs/marketplaceReconciliation.queue';

import { marketplaceTransferService } from './marketplaceTransfer.service';
import { enqueueTransferJob } from '../../jobs/marketplaceTransferQueue.job';
import { ITransferOperation } from './transferOperation.interface';

export class MarketplaceWebhookService {
  /**
   * Initializes Phase 4B & 4C Webhook Handlers and registers them with Phase 1 Dispatcher.
   */
  public registerHandlers(): void {
    stripeEventDispatcher.registerHandler('payment_intent.succeeded', this.handlePaymentIntentSucceeded.bind(this));
    stripeEventDispatcher.registerHandler('payment_intent.payment_failed', this.handlePaymentIntentFailed.bind(this));
    stripeEventDispatcher.registerHandler('payment_intent.processing', this.handlePaymentIntentProcessing.bind(this));
    stripeEventDispatcher.registerHandler('payment_intent.canceled', this.handlePaymentIntentCanceled.bind(this));
    stripeEventDispatcher.registerHandler('transfer.created', this.handleTransferCreatedEvent.bind(this));
    stripeEventDispatcher.registerHandler('transfer.reversed', this.handleTransferReversedEvent.bind(this));
  }

  /**
   * 10-Point Authoritative Webhook Validation Assertion.
   */
  public validatePaymentIntentWebhook(
    pi: any,
    payment: IPayment
  ): { valid: boolean; reason?: ReconciliationReason; details?: string } {
    const expectedLivemode = config.stripe.expected_livemode;

    if (pi.livemode !== expectedLivemode) {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'Livemode mismatch' };
    }

    if (payment.paymentIntentId && pi.id !== payment.paymentIntentId) {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'PaymentIntent ID mismatch' };
    }

    const metadata = pi.metadata || {};

    if (metadata.paymentId !== payment._id.toString()) {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'metadata.paymentId mismatch' };
    }

    if (pi.amount !== payment.amount) {
      return { valid: false, reason: 'AMOUNT_MISMATCH', details: `Amount mismatch: Stripe ${pi.amount} vs DB ${payment.amount}` };
    }

    if (pi.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      return { valid: false, reason: 'CURRENCY_MISMATCH', details: `Currency mismatch: Stripe ${pi.currency} vs DB ${payment.currency}` };
    }

    if (metadata.userId !== payment.userId.toString()) {
      return { valid: false, reason: 'OWNERSHIP_MISMATCH', details: 'metadata.userId mismatch' };
    }

    if (metadata.platform !== 'SKATRIUM_MARKETPLACE') {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'metadata.platform invalid' };
    }

    if (metadata.engineVersion !== 'PHASE_4_MARKETPLACE') {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'metadata.engineVersion invalid' };
    }

    if (metadata.paymentType !== payment.paymentType) {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'metadata.paymentType mismatch' };
    }

    if (metadata.checkoutFingerprint && metadata.checkoutFingerprint !== payment.checkoutFingerprint) {
      return { valid: false, reason: 'METADATA_MISMATCH', details: 'metadata.checkoutFingerprint mismatch' };
    }

    return { valid: true };
  }

  /**
   * Handler for payment_intent.succeeded
   */
  public async handlePaymentIntentSucceeded(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const pi = (rawEvent?.data?.object || eventSnapshot.payload) as any;
    const paymentIdStr = pi?.metadata?.paymentId;

    if (!paymentIdStr) {
      logger.warn(`Phase 4B Dispatcher: Ignoring event ${eventSnapshot.stripeEventId} - missing metadata.paymentId`);
      return;
    }

    const payment = await Payment.findById(paymentIdStr);
    if (!payment || payment.engineVersion !== 'PHASE_4_MARKETPLACE') {
      return; // Not a Phase 4 payment; skip for legacy isolation
    }

    // 1. Authoritative Webhook Validation
    const validation = this.validatePaymentIntentWebhook(pi, payment);
    if (!validation.valid) {
      logger.error(`Phase 4B Security Alert: Webhook validation failed for payment ${payment._id}: ${validation.details}`);
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: validation.reason } }
      );
      if (validation.reason) {
        await enqueueReconciliationJob(payment._id.toString(), validation.reason);
      }
      return;
    }

    // 2. Monotonic Chronology Guard
    const eventDate = new Date((rawEvent?.created || eventSnapshot.payload.created) * 1000);
    if (payment.stripeLastEventCreatedAt && eventDate.getTime() < payment.stripeLastEventCreatedAt.getTime()) {
      logger.info(`Phase 4B Dispatcher: Discarding older stale event ${eventSnapshot.stripeEventId} for payment ${payment._id}`);
      return;
    }

    // 3. State Machine Transition Evaluation
    if (payment.status === 'SUCCEEDED') {
      // Idempotent duplicate delivery -> Explicitly clear reconciliationReason if any stale value existed
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { stripeLastEventCreatedAt: eventDate, reconciliationReason: null } }
      );
      return;
    }

    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
      // Late Success Boundary!
      logger.warn(`Phase 4B Alert: Late success received for payment ${payment._id} in status ${payment.status}`);
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'RECONCILIATION_REQUIRED',
            reconciliationReason: 'RESERVATION_ALREADY_RELEASED',
            stripeLastEventCreatedAt: eventDate,
          },
        }
      );
      return;
    }

    if (
      !['PENDING', 'PROCESSING'].includes(payment.status) &&
      !(payment.status === 'RECONCILIATION_REQUIRED' && payment.reconciliationReason !== 'RESERVATION_ALREADY_RELEASED')
    ) {
      return;
    }

    // 4. Transaction A: Atomic Confirmation & Exact Cart Clearing
    const sessionA = await mongoose.startSession();
    let transactionASucceeded = false;

    try {
      await sessionA.withTransaction(async () => {
        const updatedPayment = await Payment.findOneAndUpdate(
          { _id: payment._id, status: { $in: ['PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED'] } },
          {
            $set: {
              status: 'SUCCEEDED',
              paymentIntentId: pi.id,
              succeededAt: new Date(),
              stripeLastEventCreatedAt: eventDate,
              reconciliationReason: null, // BLOCKER 2 FIX: Explicitly clear reconciliationReason upon resolution to SUCCEEDED
            },
          },
          { session: sessionA, new: true }
        );

        if (!updatedPayment) {
          throw new Error('Payment status update race condition');
        }

        const reservations = await ReservationRecord.find({ paymentId: payment._id }).session(sessionA);
        for (const res of reservations) {
          await marketplaceCheckoutService.confirmReservation(res._id, sessionA);
        }

        // Exact cart line removal via atomic $pull by purchasedCartItemIds
        if (payment.paymentType === 'PRODUCT_CART' && payment.purchasedCartItemIds?.length) {
          await Cart.updateOne(
            { user: payment.userId },
            { $pull: { items: { _id: { $in: payment.purchasedCartItemIds } } } },
            { session: sessionA }
          );
        }

        // Phase 4C: Create durable TransferOperation records for each seller allocation inside Mongo transaction
        const createdOps = await marketplaceTransferService.createTransferOperationsForPayment(payment._id, sessionA);

        transactionASucceeded = true;

        // Post-commit fire-and-forget BullMQ enqueueing for created TransferOperation records
        for (const op of createdOps) {
          if (op.status === 'NOT_STARTED') {
            enqueueTransferJob(op._id.toString(), op.paymentId.toString(), op.allocationId).catch((err) =>
              logger.warn(`Post-commit transfer enqueue blip for op ${op._id}: ${err.message}`)
            );
          }
        }
      });
    } catch (txAErr: any) {
      logger.error(`Phase 4B/4C Transaction A Failed for payment ${payment._id}:`, txAErr);
    } finally {
      sessionA.endSession();
    }

    // 5. Fallback Transaction B if Transaction A Aborted
    if (!transactionASucceeded) {
      const sessionB = await mongoose.startSession();
      try {
        await sessionB.withTransaction(async () => {
          await Payment.updateOne(
            { _id: payment._id },
            {
              $set: {
                status: 'RECONCILIATION_REQUIRED',
                reconciliationReason: 'RESERVATION_CONFIRMATION_FAILURE',
                stripeLastEventCreatedAt: eventDate,
              },
            },
            { session: sessionB }
          );
        });
      } finally {
        sessionB.endSession();
      }
    }
  }

  /**
   * Handler for payment_intent.payment_failed
   */
  public async handlePaymentIntentFailed(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const pi = (rawEvent?.data?.object || eventSnapshot.payload) as any;
    const paymentIdStr = pi?.metadata?.paymentId;

    if (!paymentIdStr) return;

    const payment = await Payment.findById(paymentIdStr);
    if (!payment || payment.engineVersion !== 'PHASE_4_MARKETPLACE') return;

    const validation = this.validatePaymentIntentWebhook(pi, payment);
    if (!validation.valid) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: validation.reason } }
      );
      if (validation.reason) {
        await enqueueReconciliationJob(payment._id.toString(), validation.reason);
      }
      return;
    }

    const eventDate = new Date((rawEvent?.created || eventSnapshot.payload.created) * 1000);
    if (payment.stripeLastEventCreatedAt && eventDate.getTime() < payment.stripeLastEventCreatedAt.getTime()) {
      return;
    }

    if (['SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
      return; // Terminal protection
    }

    // Inspect PI status for retryability!
    if (pi.status === 'requires_payment_method') {
      // Retryable failed attempt! Keep Payment PENDING, reservations RESERVED. Customer retries on frontend.
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { stripeLastEventCreatedAt: eventDate } }
      );
      return;
    }

    if (pi.status === 'canceled') {
      // Terminal failure -> Transition FAILED and release reservations
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'FAILED',
            failedAt: new Date(),
            stripeLastEventCreatedAt: eventDate,
            reconciliationReason: null, // BLOCKER 2 FIX: Explicitly clear reconciliationReason upon resolution to FAILED
          },
        }
      );

      const reservations = await ReservationRecord.find({ paymentId: payment._id });
      for (const res of reservations) {
        await marketplaceCheckoutService.releaseReservation(res._id);
      }
    }
  }

  /**
   * Handler for payment_intent.processing
   */
  public async handlePaymentIntentProcessing(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const pi = (rawEvent?.data?.object || eventSnapshot.payload) as any;
    const paymentIdStr = pi?.metadata?.paymentId;

    if (!paymentIdStr) return;

    const payment = await Payment.findById(paymentIdStr);
    if (!payment || payment.engineVersion !== 'PHASE_4_MARKETPLACE') return;

    const validation = this.validatePaymentIntentWebhook(pi, payment);
    if (!validation.valid) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: validation.reason } }
      );
      if (validation.reason) {
        await enqueueReconciliationJob(payment._id.toString(), validation.reason);
      }
      return;
    }

    const eventDate = new Date((rawEvent?.created || eventSnapshot.payload.created) * 1000);
    if (payment.stripeLastEventCreatedAt && eventDate.getTime() < payment.stripeLastEventCreatedAt.getTime()) {
      return;
    }

    if (['SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
      return;
    }

    // Transition to PROCESSING & extend reservation TTL to 7 days from checkout creation
    const extendedTTL = new Date(payment.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'PROCESSING',
          paymentIntentId: pi.id,
          stripeLastEventCreatedAt: eventDate,
        },
      }
    );

    await ReservationRecord.updateMany(
      { paymentId: payment._id, status: 'RESERVED' },
      { $set: { expiresAt: extendedTTL } }
    );
  }

  /**
   * Handler for payment_intent.canceled
   */
  public async handlePaymentIntentCanceled(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const pi = (rawEvent?.data?.object || eventSnapshot.payload) as any;
    const paymentIdStr = pi?.metadata?.paymentId;

    if (!paymentIdStr) return;

    const payment = await Payment.findById(paymentIdStr);
    if (!payment || payment.engineVersion !== 'PHASE_4_MARKETPLACE') return;

    const validation = this.validatePaymentIntentWebhook(pi, payment);
    if (!validation.valid) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: validation.reason } }
      );
      if (validation.reason) {
        await enqueueReconciliationJob(payment._id.toString(), validation.reason);
      }
      return;
    }

    const eventDate = new Date((rawEvent?.created || eventSnapshot.payload.created) * 1000);
    if (payment.stripeLastEventCreatedAt && eventDate.getTime() < payment.stripeLastEventCreatedAt.getTime()) {
      return;
    }

    if (['SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
      return;
    }

    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'CANCELED',
          canceledAt: new Date(),
          stripeLastEventCreatedAt: eventDate,
          reconciliationReason: null, // BLOCKER 2 FIX: Explicitly clear reconciliationReason upon resolution to CANCELED
        },
      }
    );

    const reservations = await ReservationRecord.find({ paymentId: payment._id });
    for (const res of reservations) {
      await marketplaceCheckoutService.releaseReservation(res._id);
    }
  }

  /**
   * Dispatcher Handler for transfer.created
   */
  public async handleTransferCreatedEvent(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const transferObj = rawEvent?.data?.object || eventSnapshot.payload;
    await marketplaceTransferService.handleTransferCreated(transferObj);
  }

  /**
   * Dispatcher Handler for transfer.reversed
   */
  public async handleTransferReversedEvent(eventSnapshot: {
    stripeEventId: string;
    payload: ISanitizedStripeSnapshot;
    rawEvent?: any;
  }): Promise<void> {
    const rawEvent = eventSnapshot.rawEvent;
    const transferObj = rawEvent?.data?.object || eventSnapshot.payload;
    await marketplaceTransferService.handleTransferReversed(transferObj);
  }
}

export const marketplaceWebhookService = new MarketplaceWebhookService();
marketplaceWebhookService.registerHandlers();
