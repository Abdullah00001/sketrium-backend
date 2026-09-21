import logger from '../../configs/logger.configs';
import { IStripeWebhookEvent } from './stripeWebhook.interface';

export type StripeEventHandler = (eventRecord: IStripeWebhookEvent) => Promise<void>;

/**
 * Phase 1 Event Dispatcher & Handler Registry.
 * Handles exact registered event types for auditing and Phase 1 acknowledgment.
 */
export class StripeEventDispatcher {
  private handlers: Map<string, StripeEventHandler> = new Map();

  constructor() {
    this.registerPhase1Handlers();
  }

  private registerPhase1Handlers(): void {
    const phase1Events = [
      'charge.dispute.closed',
      'charge.dispute.created',
      'charge.dispute.updated',
      'payment_intent.payment_failed',
      'payment_intent.processing',
      'payment_intent.succeeded',
      'transfer.created',
      'transfer.reversed',
    ];

    for (const eventType of phase1Events) {
      this.handlers.set(eventType, async (eventRecord: IStripeWebhookEvent) => {
        logger.info(
          `[StripeDispatcher] Handled event type: ${eventType} | stripeEventId: ${eventRecord.stripeEventId} | objectId: ${eventRecord.stripeObjectId || 'N/A'}`
        );
      });
    }
  }

  /**
   * Check whether an event type is registered in Phase 1.
   */
  isSupported(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  /**
   * Register a custom business event handler for a specific Stripe event type.
   */
  registerHandler(eventType: string, handler: StripeEventHandler): void {
    const existing = this.handlers.get(eventType);
    if (existing) {
      // Chain existing logging handler with business handler
      this.handlers.set(eventType, async (eventRecord: IStripeWebhookEvent) => {
        await existing(eventRecord);
        await handler(eventRecord);
      });
    } else {
      this.handlers.set(eventType, handler);
    }
  }

  /**
   * Dispatch an event to its registered handler.
   */
  async dispatch(eventRecord: IStripeWebhookEvent): Promise<void> {
    const handler = this.handlers.get(eventRecord.eventType);
    if (!handler) {
      logger.info(
        `[StripeDispatcher] Unsupported event type acknowledged: ${eventRecord.eventType} | stripeEventId: ${eventRecord.stripeEventId}`
      );
      return;
    }
    await handler(eventRecord);
  }
}

export const stripeEventDispatcher = new StripeEventDispatcher();
