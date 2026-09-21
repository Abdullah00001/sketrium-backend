import { Queue } from 'bullmq';
import logger from '../configs/logger.configs';
import config from '../config';
import {
  AUTOMATIC_RECONCILIATION_REASONS,
  MANUAL_RECONCILIATION_REASONS,
} from '../modules/marketplace/marketplaceReconciliation.service';
import { ReconciliationReason } from '../modules/marketplace/marketplacePayment.interface';

export const RECONCILIATION_QUEUE_NAME = 'marketplace-reconciliation-queue';

export const redisConnectionOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const reconciliationQueue = new Queue(RECONCILIATION_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/**
 * Retry-safe Job Enqueue Function.
 * Strictly blocks manual reconciliation reasons from being automatically queued.
 */
export async function enqueueReconciliationJob(
  paymentId: string,
  reason: ReconciliationReason
): Promise<{ enqueued: boolean; jobId?: string; message?: string }> {
  // 1. Safety Gate: MANUAL reasons MUST NOT be automatically queued!
  if (MANUAL_RECONCILIATION_REASONS.includes(reason)) {
    logger.warn(
      `Marketplace Reconciliation Queue Gate: Blocked automatic queueing for payment ${paymentId} (Manual Reason: ${reason})`
    );
    return {
      enqueued: false,
      message: `Automatic queueing prohibited for manual reason ${reason}`,
    };
  }

  if (!AUTOMATIC_RECONCILIATION_REASONS.includes(reason)) {
    return {
      enqueued: false,
      message: `Unrecognized reconciliation reason ${reason}`,
    };
  }

  // 2. Deterministic Job ID to prevent duplicate reconciliation jobs for the same payment & reason
  const jobId = `recon_${paymentId}_${reason}`;

  try {
    const job = await reconciliationQueue.add(
      'reconcile-payment',
      { paymentId }, // Enqueue ONLY paymentId; NO sensitive financial or secret data
      {
        jobId,
      }
    );

    logger.info(
      `Marketplace Reconciliation Queue: Enqueued job ${job.id} for payment ${paymentId} (Reason: ${reason})`
    );

    return { enqueued: true, jobId: job.id };
  } catch (err: any) {
    logger.error(`Marketplace Reconciliation Queue Error for payment ${paymentId}:`, err);
    return { enqueued: false, message: err.message };
  }
}

export async function closeMarketplaceReconciliationQueue(): Promise<void> {
  if (reconciliationQueue) {
    await reconciliationQueue.close();
  }
}
