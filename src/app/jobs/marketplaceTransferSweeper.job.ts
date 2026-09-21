import logger from '../configs/logger.configs';
import { marketplaceTransferService } from '../modules/marketplace/marketplaceTransfer.service';

let sweeperIntervalTimer: NodeJS.Timeout | null = null;
let isSweeperRunning = false;

export async function runMarketplaceTransferSweeper(): Promise<number> {
  if (isSweeperRunning) {
    logger.info('Marketplace Transfer Sweeper: Previous sweep cycle still in progress. Skipping.');
    return 0;
  }

  isSweeperRunning = true;
  try {
    const sweptCount = await marketplaceTransferService.sweepStalledTransfers();
    if (sweptCount > 0) {
      logger.info(`Marketplace Transfer Sweeper: Successfully claimed and enqueued ${sweptCount} stalled operations.`);
    }
    return sweptCount;
  } catch (err: any) {
    logger.error('Marketplace Transfer Sweeper Error:', err);
    return 0;
  } finally {
    isSweeperRunning = false;
  }
}

export function startMarketplaceTransferSweeper(intervalMs: number = 120000): void {
  if (sweeperIntervalTimer) {
    return;
  }

  logger.info(`Starting Marketplace Transfer Sweeper with polling interval of ${intervalMs}ms`);
  sweeperIntervalTimer = setInterval(async () => {
    await runMarketplaceTransferSweeper();
  }, intervalMs);
}

export function stopMarketplaceTransferSweeper(): void {
  if (sweeperIntervalTimer) {
    clearInterval(sweeperIntervalTimer);
    sweeperIntervalTimer = null;
    logger.info('Marketplace Transfer Sweeper stopped.');
  }
}
