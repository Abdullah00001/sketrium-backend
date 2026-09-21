import { Queue, Worker, Job } from 'bullmq';
import logger from '../configs/logger.configs';
import { redisConnectionOptions } from './marketplaceReconciliation.queue';
import { marketplaceTransferService } from '../modules/marketplace/marketplaceTransfer.service';

export const TRANSFER_QUEUE_NAME = 'marketplace-transfer-queue';

export const marketplaceTransferQueue = new Queue(TRANSFER_QUEUE_NAME, {
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

export async function enqueueTransferJob(
  transferOperationId: string,
  paymentId?: string,
  allocationId?: string
): Promise<{ enqueued: boolean; jobId?: string; message?: string }> {
  const jobId = paymentId && allocationId ? `transfer_${paymentId}_${allocationId}` : undefined;

  try {
    const job = await marketplaceTransferQueue.add(
      'execute-transfer',
      { transferOperationId },
      { jobId }
    );
    logger.info(
      `Marketplace Transfer Queue: Enqueued job ${job.id} for transferOperation ${transferOperationId}`
    );
    return { enqueued: true, jobId: job.id };
  } catch (err: any) {
    logger.error(`Marketplace Transfer Queue Enqueue Error for op ${transferOperationId}:`, err);
    return { enqueued: false, message: err.message };
  }
}

export let transferWorker: Worker | null = null;

export function initMarketplaceTransferWorker(): Worker {
  if (transferWorker) {
    return transferWorker;
  }

  transferWorker = new Worker(
    TRANSFER_QUEUE_NAME,
    async (job: Job<{ transferOperationId: string }>) => {
      const { transferOperationId } = job.data;
      await marketplaceTransferService.executeTransferOperation(transferOperationId);
    },
    {
      connection: redisConnectionOptions,
      concurrency: 5,
    }
  );

  transferWorker.on('completed', (job) => {
    logger.info(`Transfer Worker: Job ${job.id} completed successfully`);
  });

  transferWorker.on('failed', (job, err) => {
    logger.error(`Transfer Worker: Job ${job?.id} failed with error:`, err);
  });

  logger.info('Marketplace Transfer BullMQ Worker initialized and listening');
  return transferWorker;
}

export async function closeMarketplaceTransferWorker(): Promise<void> {
  if (transferWorker) {
    await transferWorker.close();
    transferWorker = null;
  }
}

export async function closeMarketplaceTransferQueue(): Promise<void> {
  if (marketplaceTransferQueue) {
    await marketplaceTransferQueue.close();
  }
}
