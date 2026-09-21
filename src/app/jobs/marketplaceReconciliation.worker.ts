import { Worker, Job } from 'bullmq';
import logger from '../configs/logger.configs';
import { Payment } from '../modules/marketplace/marketplacePayment.model';
import {
  marketplaceReconciliationService,
  MANUAL_RECONCILIATION_REASONS,
} from '../modules/marketplace/marketplaceReconciliation.service';
import {
  RECONCILIATION_QUEUE_NAME,
  redisConnectionOptions,
} from './marketplaceReconciliation.queue';

export async function processReconciliationJob(job: Job<{ paymentId: string }>): Promise<{
  paymentId: string;
  processed: boolean;
  result?: any;
}> {
  const { paymentId } = job.data;

  // 1. Load Payment from MongoDB
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    logger.warn(`Reconciliation Worker: Payment ${paymentId} not found in DB. Skipping job.`);
    return { paymentId, processed: false };
  }

  // 2. Idempotent State Assertion: Must be in RECONCILIATION_REQUIRED state
  if (payment.status !== 'RECONCILIATION_REQUIRED') {
    logger.info(
      `Reconciliation Worker: Payment ${paymentId} is in status ${payment.status}, not RECONCILIATION_REQUIRED. Idempotently stopping job.`
    );
    return { paymentId, processed: false };
  }

  // 3. Safety Gate: MANUAL reasons MUST NOT be automatically fulfilled!
  const reason = payment.reconciliationReason || 'UNKNOWN';
  if (MANUAL_RECONCILIATION_REASONS.includes(reason)) {
    logger.warn(
      `Reconciliation Worker: Payment ${paymentId} has manual reconciliationReason ${reason}. Stopping worker execution without fulfillment.`
    );
    return { paymentId, processed: false };
  }

  // 4. Delegate Authoritative Reconciliation to Service
  const reconciliationResult = await marketplaceReconciliationService.reconcilePayment(paymentId);

  return {
    paymentId,
    processed: reconciliationResult.reconciled,
    result: reconciliationResult,
  };
}

export let reconciliationWorker: Worker | null = null;

export function initMarketplaceReconciliationWorker(): Worker {
  if (reconciliationWorker) {
    return reconciliationWorker;
  }

  reconciliationWorker = new Worker(
    RECONCILIATION_QUEUE_NAME,
    async (job: Job<{ paymentId: string }>) => {
      return processReconciliationJob(job);
    },
    {
      connection: redisConnectionOptions,
      concurrency: 5,
    }
  );

  reconciliationWorker.on('completed', (job) => {
    logger.info(`Reconciliation Worker: Job ${job.id} completed successfully`);
  });

  reconciliationWorker.on('failed', (job, err) => {
    logger.error(`Reconciliation Worker: Job ${job?.id} failed with error:`, err);
  });

  logger.info('Marketplace Reconciliation BullMQ Worker initialized and listening');
  return reconciliationWorker;
}

// Auto-initialize worker upon module export
initMarketplaceReconciliationWorker();

export async function closeMarketplaceReconciliationWorker(): Promise<void> {
  if (reconciliationWorker) {
    await reconciliationWorker.close();
    reconciliationWorker = null;
  }
}
