import Stripe from 'stripe';
import config from '../../config';
import logger from '../../configs/logger.configs';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import { stripeWebhookRepository } from './stripeWebhook.repository';
import { stripeEventDispatcher } from './stripeWebhook.dispatcher';
import { ISanitizedStripeSnapshot } from './stripeWebhook.interface';

const stripe = new Stripe(config.stripe.stripe_secret_key as string || 'dummy_key');

export class StripeWebhookService {
  /**
   * Process incoming Stripe webhook request.
   * Performs signature verification, livemode validation, persistence, atomic claim,
   * dispatcher execution, and error handling.
   */
  async handleWebhookRequest(rawBody: Buffer, signatureHeader?: string) {
    if (!signatureHeader) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Missing stripe-signature header');
    }

    const webhookSecret = config.stripe.stripe_webhook_secret;
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET is not configured in environment variables');
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Webhook secret not configured');
    }

    let event: ReturnType<typeof stripe.webhooks.constructEvent>;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch (err: any) {
      logger.warn(`Stripe signature verification failed: ${err.message}`);
      throw new AppError(httpStatus.BAD_REQUEST, `Webhook Signature Verification Failed: ${err.message}`);
    }

    // Livemode Validation
    const expectedLivemode = config.stripe.expected_livemode;
    if (event.livemode !== expectedLivemode) {
      logger.warn(
        `Stripe event livemode mismatch: event livemode is ${event.livemode}, but server expected livemode is ${expectedLivemode}`
      );
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Livemode mismatch: expected ${expectedLivemode}, got ${event.livemode}`
      );
    }

    // Extract minimal sanitized event snapshot as required by Architecture Correction #3
    const stripeObjectId = (event.data?.object as any)?.id;
    const stripeObjectType = (event.data?.object as any)?.object;

    const sanitizedSnapshot: ISanitizedStripeSnapshot = {
      id: event.id,
      type: event.type,
      apiVersion: event.api_version || undefined,
      created: event.created,
      livemode: event.livemode,
      account: (event as any).account || undefined,
      objectId: stripeObjectId,
      objectType: stripeObjectType,
    };

    const eventMetaData = {
      stripeEventId: event.id,
      eventType: event.type,
      apiVersion: event.api_version || undefined,
      livemode: event.livemode,
      stripeAccountId: (event as any).account || undefined,
      stripeObjectId,
      stripeCreatedAt: new Date(event.created * 1000),
      payload: sanitizedSnapshot,
    };

    // 1. Persistence Ingestion (Ensure record exists)
    let eventRecord = await stripeWebhookRepository.findByEventId(event.id);
    if (!eventRecord) {
      eventRecord = await stripeWebhookRepository.createPendingEvent(eventMetaData);
    }

    // 2. Atomic Claim Strategy
    const claimedRecord = await stripeWebhookRepository.claimProcessing(event.id);

    if (!claimedRecord) {
      // Re-fetch record to inspect state
      const currentRecord = await stripeWebhookRepository.findByEventId(event.id);
      if (currentRecord?.processingStatus === 'SUCCESS') {
        logger.info(`Stripe event ${event.id} already processed successfully.`);
        return { success: true, status: 'already_processed', eventId: event.id };
      }
      if (currentRecord?.processingStatus === 'PROCESSING') {
        logger.info(`Stripe event ${event.id} is currently being processed by another execution thread.`);
        return { success: true, status: 'processing', eventId: event.id };
      }
      // If unable to claim (and not SUCCESS/PROCESSING), throw error to trigger retry
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to claim event processing lock');
    }

    // 3. Webhook Event Processing & Dispatching
    try {
      if (!stripeEventDispatcher.isSupported(event.type)) {
        // Architecture Correction #10: Unsupported events are persisted, marked SUCCESS/acknowledged, and return 200
        await stripeWebhookRepository.markSuccess(event.id);
        logger.info(`Unsupported Stripe event type acknowledged: ${event.type} (${event.id})`);
        return { success: true, status: 'unsupported_acknowledged', eventId: event.id };
      }

      // Execute registered Phase 1 event handler
      await stripeEventDispatcher.dispatch(claimedRecord);

      // Transition state machine to SUCCESS
      await stripeWebhookRepository.markSuccess(event.id);

      return { success: true, status: 'processed', eventId: event.id };
    } catch (processingErr: any) {
      // Architecture Correction #3: Structured error persistence in DB (no full stack in DB)
      const structuredError = {
        code: processingErr.code || 'PROCESSING_ERROR',
        message: processingErr.message || 'Error occurred during event handling',
        category: 'EVENT_HANDLER_FAILURE',
      };

      // Full stack trace goes exclusively to Winston logging system
      logger.error(`Stripe event processing failed for ${event.id}:`, processingErr);

      await stripeWebhookRepository.markFailed(event.id, structuredError);

      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Webhook processing failed: ${processingErr.message}`
      );
    }
  }
}

export const stripeWebhookService = new StripeWebhookService();
