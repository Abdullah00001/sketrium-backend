import config from '../../config';
import { StripeWebhookEvent } from './stripeWebhook.model';
import { IStripeWebhookEvent, ISanitizedStripeSnapshot, IStripeStructuredError } from './stripeWebhook.interface';

/**
 * Stripe Webhook Repository layer.
 * Manages database persistence and atomic state machine transitions for Stripe events.
 * 
 * NOTE ON STALE PROCESSING LOCKS:
 * Stale PROCESSING recovery (driven by STRIPE_WEBHOOK_PROCESSING_TIMEOUT_MS) is an
 * abandoned-processing recovery mechanism, NOT proof that the original process has died.
 * The PROCESSING timestamp lock is NOT a guaranteed distributed lease; a stale lock can
 * theoretically be reclaimed while the original process is still running.
 * Therefore, Phase 1 handlers must remain side-effect-light/idempotent, and future financial
 * handlers MUST implement their own business-operation idempotency.
 */
export class StripeWebhookRepository {
  /**
   * Find existing webhook event by stripeEventId.
   */
  async findByEventId(stripeEventId: string): Promise<IStripeWebhookEvent | null> {
    return StripeWebhookEvent.findOne({ stripeEventId });
  }

  /**
   * Create initial PENDING event record with sanitized snapshot.
   */
  async createPendingEvent(eventData: {
    stripeEventId: string;
    eventType: string;
    apiVersion?: string;
    livemode: boolean;
    stripeAccountId?: string;
    stripeObjectId?: string;
    stripeCreatedAt: Date;
    payload: ISanitizedStripeSnapshot;
  }): Promise<IStripeWebhookEvent> {
    try {
      return await StripeWebhookEvent.create({
        ...eventData,
        processingStatus: 'PENDING',
        receivedAt: new Date(),
        attemptCount: 0,
      });
    } catch (err: any) {
      // If duplicate key error E11000 occurs due to race condition on insert
      if (err.code === 11000) {
        const existing = await this.findByEventId(eventData.stripeEventId);
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * Atomically claim PROCESSING status for an event.
   * Uses MongoDB findOneAndUpdate filter on processingStatus to prevent concurrent handler execution.
   */
  async claimProcessing(stripeEventId: string): Promise<IStripeWebhookEvent | null> {
    const now = new Date();
    const timeoutMs = config.stripe.processing_timeout_ms || 300000;
    const staleThreshold = new Date(now.getTime() - timeoutMs);

    return StripeWebhookEvent.findOneAndUpdate(
      {
        stripeEventId,
        $or: [
          { processingStatus: 'PENDING' },
          { processingStatus: 'FAILED' },
          { processingStatus: 'PROCESSING', lastAttemptAt: { $lt: staleThreshold } },
        ],
      },
      {
        $set: {
          processingStatus: 'PROCESSING',
          lastAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      { new: true }
    );
  }

  /**
   * Mark event as SUCCESS.
   */
  async markSuccess(stripeEventId: string): Promise<IStripeWebhookEvent | null> {
    return StripeWebhookEvent.findOneAndUpdate(
      { stripeEventId },
      {
        $set: {
          processingStatus: 'SUCCESS',
          processedAt: new Date(),
        },
        $unset: { error: 1 },
      },
      { new: true }
    );
  }

  /**
   * Mark event as FAILED with structured error.
   */
  async markFailed(
    stripeEventId: string,
    error: IStripeStructuredError
  ): Promise<IStripeWebhookEvent | null> {
    return StripeWebhookEvent.findOneAndUpdate(
      { stripeEventId },
      {
        $set: {
          processingStatus: 'FAILED',
          failedAt: new Date(),
          error,
        },
      },
      { new: true }
    );
  }
}

export const stripeWebhookRepository = new StripeWebhookRepository();
