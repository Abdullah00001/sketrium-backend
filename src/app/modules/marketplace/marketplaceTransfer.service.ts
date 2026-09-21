import mongoose, { Types, ClientSession } from 'mongoose';
import logger from '../../configs/logger.configs';
import AppError from '../../error/AppError';
import { getStripeClient } from '../../utils/stripeClient';
import { Payment } from './marketplacePayment.model';
import { TransferOperation } from './transferOperation.model';
import { ITransferOperation, IStripeReversalItem } from './transferOperation.interface';
import { enqueueTransferJob } from '../../jobs/marketplaceTransferQueue.job';

export class MarketplaceTransferService {
  /**
   * Creates TransferOperation records inside the payment completion Mongo transaction.
   */
  public async createTransferOperationsForPayment(
    paymentId: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<ITransferOperation[]> {
    const payment = await Payment.findById(paymentId).session(session || null);
    if (!payment) {
      throw new AppError(404, `Payment ${paymentId} not found`);
    }

    if (payment.status !== 'SUCCEEDED') {
      throw new AppError(409, `Payment ${paymentId} status is ${payment.status}, expected SUCCEEDED`);
    }

    const createdOperations: ITransferOperation[] = [];

    for (const alloc of payment.allocations) {
      const idempotencyKey = `tr_exec_${payment._id.toString()}_${alloc.allocationId}`;

      const isZeroAmount = alloc.amount === 0;
      const initialStatus = isZeroAmount ? 'CREATED' : 'NOT_STARTED';
      const executionSkipReason = isZeroAmount ? 'ZERO_AMOUNT' : null;

      try {
        const opDocs = await TransferOperation.create(
          [
            {
              paymentId: payment._id,
              allocationId: alloc.allocationId,
              sellerUserId: alloc.sellerUserId,
              sellerRole: alloc.sellerRole,
              stripeConnectedAccountId: alloc.stripeConnectedAccountId,
              amount: alloc.amount,
              currency: payment.currency,
              status: initialStatus,
              stripeIdempotencyKey: idempotencyKey,
              stripeTransferId: null,
              executionSkipReason: executionSkipReason,
              originalAmount: alloc.amount,
              reversedAmount: 0,
              remainingAmount: alloc.amount,
              reconciliationState: 'NONE',
              reversals: [],
            },
          ],
          { session: session || null }
        );

        createdOperations.push(opDocs[0]);
      } catch (err: any) {
        if (err.code === 11000) {
          logger.info(`TransferOperation already exists for allocation ${alloc.allocationId} (Idempotent bypass)`);
          const existingOp = await TransferOperation.findOne({
            paymentId: payment._id,
            allocationId: alloc.allocationId,
          }).session(session || null);
          if (existingOp) createdOperations.push(existingOp);
        } else {
          throw err;
        }
      }
    }

    return createdOperations;
  }

  /**
   * Worker Execution Function: Executes a single TransferOperation.
   */
  public async executeTransferOperation(transferOperationId: string): Promise<ITransferOperation> {
    const op = await TransferOperation.findById(transferOperationId);
    if (!op) {
      throw new AppError(404, `TransferOperation ${transferOperationId} not found`);
    }

    // 1. Duplicate Protection: If already CREATED, exit safely (No-Op)
    if (op.status === 'CREATED') {
      logger.info(`TransferWorker: Operation ${op._id} is already CREATED. Returning safely.`);
      return op;
    }

    // 2. Load and Validate Parent Payment
    const payment = await Payment.findById(op.paymentId);
    if (!payment || payment.status !== 'SUCCEEDED') {
      await TransferOperation.updateOne(
        { _id: op._id },
        {
          $set: {
            status: 'RECONCILIATION_REQUIRED',
            reconciliationReason: 'PAYMENT_NOT_SUCCEEDED',
          },
        }
      );
      throw new AppError(409, `Payment for operation ${op._id} is not SUCCEEDED`);
    }

    // 3. Validate Account & Allocation Ownership Snapshot
    const allocSnapshot = payment.allocations.find((a) => a.allocationId === op.allocationId);
    if (
      !allocSnapshot ||
      allocSnapshot.stripeConnectedAccountId !== op.stripeConnectedAccountId ||
      allocSnapshot.sellerUserId.toString() !== op.sellerUserId.toString() ||
      allocSnapshot.amount !== op.amount
    ) {
      await TransferOperation.updateOne(
        { _id: op._id },
        {
          $set: {
            status: 'RECONCILIATION_REQUIRED',
            reconciliationReason: 'OWNERSHIP_MISMATCH',
          },
        }
      );
      throw new AppError(409, `Allocation snapshot mismatch for operation ${op._id}`);
    }

    // Zero Amount Skip Safeguard
    if (op.amount === 0) {
      const updatedZero = await TransferOperation.findOneAndUpdate(
        { _id: op._id },
        {
          $set: {
            status: 'CREATED',
            stripeTransferId: null,
            executionSkipReason: 'ZERO_AMOUNT',
            reconciliationReason: null,
          },
        },
        { new: true }
      );
      return updatedZero || op;
    }

    // 4. Atomic State Claim: Transition to CREATING
    const claimedOp = await TransferOperation.findOneAndUpdate(
      {
        _id: op._id,
        status: { $in: ['NOT_STARTED', 'RECOVERY_REQUIRED'] },
      },
      {
        $set: { status: 'CREATING', lastAttemptAt: new Date() },
        $inc: { attemptCount: 1, lockVersion: 1 },
      },
      { new: true }
    );

    if (!claimedOp) {
      logger.warn(`TransferWorker: Atomic claim failed for op ${op._id}. State was not NOT_STARTED or RECOVERY_REQUIRED.`);
      return op;
    }

    // 5. Uncertain Stripe Transfer Recovery & Creation
    const stripe = getStripeClient();

    let existingTransfersData: any[] = [];
    try {
      if (typeof stripe.transfers?.list === 'function') {
        const listRes = await stripe.transfers.list({
          transfer_group: claimedOp.paymentId.toString(),
          destination: claimedOp.stripeConnectedAccountId,
          limit: 10,
        });
        existingTransfersData = listRes?.data || [];
      }
    } catch (listErr: any) {
      logger.warn(`Stripe transfers.list recovery check returned error for op ${claimedOp._id}: ${listErr.message || listErr}`);
      throw listErr;
    }

    const matches = existingTransfersData.filter((t: any) => {
      const meta = t.metadata || {};
      return (
        meta.paymentId === claimedOp.paymentId.toString() &&
        meta.allocationId === claimedOp.allocationId &&
        t.destination === claimedOp.stripeConnectedAccountId &&
        t.amount === claimedOp.amount &&
        (t.currency || '').toLowerCase() === claimedOp.currency.toLowerCase()
      );
    });

    if (matches.length === 1) {
      const discoveredTransfer = matches[0];
      logger.info(`Uncertain transfer recovery: Found existing matching transfer ${discoveredTransfer.id} for op ${claimedOp._id}`);
      const finalOp = await TransferOperation.findOneAndUpdate(
        { _id: claimedOp._id },
        {
          $set: {
            status: 'CREATED',
            stripeTransferId: discoveredTransfer.id,
            transferCreatedAt: new Date((discoveredTransfer.created || Math.floor(Date.now() / 1000)) * 1000),
            reconciliationReason: null,
            failureReason: null,
          },
        },
        { new: true }
      );
      return finalOp || claimedOp;
    }

    if (matches.length > 1) {
      logger.error(`Uncertain transfer recovery: Multiple matching transfers (${matches.length}) found for op ${claimedOp._id}`);
      const finalOp = await TransferOperation.findOneAndUpdate(
        { _id: claimedOp._id },
        {
          $set: {
            status: 'RECONCILIATION_REQUIRED',
            reconciliationReason: 'MULTIPLE_TRANSFERS_MATCHED',
          },
        },
        { new: true }
      );
      return finalOp || claimedOp;
    }

    // Exactly 0 matches -> Execute Stripe API Call using Persistent Idempotency Key
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: claimedOp.amount,
          currency: claimedOp.currency.toLowerCase(),
          destination: claimedOp.stripeConnectedAccountId,
          transfer_group: claimedOp.paymentId.toString(),
          metadata: {
            paymentId: claimedOp.paymentId.toString(),
            allocationId: claimedOp.allocationId,
            sellerUserId: claimedOp.sellerUserId.toString(),
            engineVersion: 'PHASE_4_MARKETPLACE',
          },
        },
        { idempotencyKey: claimedOp.stripeIdempotencyKey }
      );

      const finalOp = await TransferOperation.findOneAndUpdate(
        { _id: claimedOp._id },
        {
          $set: {
            status: 'CREATED',
            stripeTransferId: transfer.id,
            transferCreatedAt: new Date((transfer.created || Math.floor(Date.now() / 1000)) * 1000),
            reconciliationReason: null,
            failureReason: null,
          },
        },
        { new: true }
      );

      return finalOp || claimedOp;
    } catch (err: any) {
      logger.error(`Stripe Transfer API Call Failed for op ${claimedOp._id}:`, err);
      const errCode = err.code || err.raw?.code || err.message;
      const statusCode = err.statusCode || err.raw?.statusCode;

      const isDefinitive =
        ['amount_too_small', 'account_invalid', 'transfers_not_allowed', 'currency_mismatch', 'account_closed'].includes(
          errCode
        ) ||
        statusCode === 400 ||
        statusCode === 404;

      if (isDefinitive) {
        await TransferOperation.updateOne(
          { _id: claimedOp._id },
          { $set: { status: 'FAILED_DEFINITIVE', failureReason: errCode } }
        );
      } else {
        const nextStatus = claimedOp.attemptCount >= 5 ? 'RECONCILIATION_REQUIRED' : 'RECOVERY_REQUIRED';
        const backoffMs = Math.min(1000 * Math.pow(2, claimedOp.attemptCount), 300000);
        await TransferOperation.updateOne(
          { _id: claimedOp._id },
          {
            $set: {
              status: nextStatus,
              failureReason: errCode,
              nextRetryAt: new Date(Date.now() + backoffMs),
            },
          }
        );
      }

      throw err;
    }
  }

  /**
   * Sweeper Function: Recovers stalled CREATING ops and enqueues NOT_STARTED / RECOVERY_REQUIRED ops.
   */
  public async sweepStalledTransfers(): Promise<number> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    let enqueuedCount = 0;

    // 1. Stalled CREATING ops -> Atomic Transition to RECOVERY_REQUIRED
    const stalledCreatingOps = await TransferOperation.find({
      status: 'CREATING',
      updatedAt: { $lte: fiveMinutesAgo },
    });

    for (const op of stalledCreatingOps) {
      const recovered = await TransferOperation.findOneAndUpdate(
        { _id: op._id, status: 'CREATING', updatedAt: op.updatedAt },
        {
          $set: {
            status: 'RECOVERY_REQUIRED',
            nextRetryAt: now,
            failureReason: 'STALLED_IN_CREATING_STATE',
          },
          $inc: { lockVersion: 1 },
        },
        { new: true }
      );

      if (recovered) {
        const res = await enqueueTransferJob(
          recovered._id.toString(),
          recovered.paymentId.toString(),
          recovered.allocationId
        );
        if (res.enqueued) enqueuedCount++;
      }
    }

    // 2. Candidate NOT_STARTED ops
    const notStartedOps = await TransferOperation.find({ status: 'NOT_STARTED' });
    for (const op of notStartedOps) {
      const res = await enqueueTransferJob(
        op._id.toString(),
        op.paymentId.toString(),
        op.allocationId
      );
      if (res.enqueued) enqueuedCount++;
    }

    // 3. Candidate RECOVERY_REQUIRED ops with nextRetryAt <= now
    const recoveryOps = await TransferOperation.find({
      status: 'RECOVERY_REQUIRED',
      $or: [{ nextRetryAt: { $lte: now } }, { nextRetryAt: { $exists: false } }],
    });

    for (const op of recoveryOps) {
      const res = await enqueueTransferJob(
        op._id.toString(),
        op.paymentId.toString(),
        op.allocationId
      );
      if (res.enqueued) enqueuedCount++;
    }

    return enqueuedCount;
  }

  /**
   * Webhook Handler for transfer.created
   */
  public async handleTransferCreated(transfer: any): Promise<void> {
    if (!transfer || !transfer.id) return;

    // 1. Direct match by stripeTransferId
    const existingByTransferId = await TransferOperation.findOne({ stripeTransferId: transfer.id });
    if (existingByTransferId) {
      logger.info(`handleTransferCreated: Transfer ${transfer.id} already attached to op ${existingByTransferId._id}`);
      return;
    }

    // 2. Resolve by metadata paymentId + allocationId
    const metadata = transfer.metadata || {};
    const paymentId = metadata.paymentId;
    const allocationId = metadata.allocationId;

    if (!paymentId || !allocationId) {
      logger.warn(`handleTransferCreated: Missing metadata paymentId/allocationId for transfer ${transfer.id}`);
      return;
    }

    const matchingOps = await TransferOperation.find({ paymentId, allocationId });
    if (matchingOps.length === 0) {
      logger.warn(`handleTransferCreated: No TransferOperation match for metadata (${paymentId}, ${allocationId})`);
      return;
    }

    if (matchingOps.length > 1) {
      logger.error(`handleTransferCreated: Ambiguous multiple operations match for (${paymentId}, ${allocationId})`);
      await TransferOperation.updateMany(
        { paymentId, allocationId },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'MULTIPLE_OPERATIONS_MATCHED' } }
      );
      return;
    }

    const op = matchingOps[0];

    // Validation
    const currencyMatches = op.currency.toUpperCase() === transfer.currency.toUpperCase();
    const amountMatches = op.amount === transfer.amount;
    const destinationMatches = op.stripeConnectedAccountId === transfer.destination;

    if (!currencyMatches || !amountMatches || !destinationMatches) {
      logger.error(`handleTransferCreated: Mismatch validation failed for op ${op._id}`);
      await TransferOperation.updateOne(
        { _id: op._id },
        { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'METADATA_MISMATCH' } }
      );
      return;
    }

    // Atomic Update
    await TransferOperation.findOneAndUpdate(
      {
        _id: op._id,
        status: { $in: ['NOT_STARTED', 'CREATING', 'RECOVERY_REQUIRED'] },
        stripeTransferId: null,
      },
      {
        $set: {
          status: 'CREATED',
          stripeTransferId: transfer.id,
          transferCreatedAt: new Date((transfer.created || Math.floor(Date.now() / 1000)) * 1000),
          reconciliationReason: null,
        },
      }
    );
  }

  /**
   * Webhook Handler for transfer.reversed
   */
  public async handleTransferReversed(transferEventObj: any): Promise<void> {
    if (!transferEventObj || !transferEventObj.id) return;

    const transferId = transferEventObj.id;
    const op = await TransferOperation.findOne({ stripeTransferId: transferId });

    if (!op) {
      logger.warn(`handleTransferReversed: No TransferOperation found for transfer ${transferId}`);
      return;
    }

    // Fetch Authoritative Stripe Transfer object with expanded reversals
    const stripe = getStripeClient();
    let stripeTransfer: any;
    try {
      stripeTransfer = await stripe.transfers.retrieve(transferId, {
        expand: ['reversals'],
      });
    } catch (err) {
      stripeTransfer = transferEventObj; // Fallback to webhook object if API call fails
    }

    const reversalsList = stripeTransfer.reversals?.data || [];
    const totalReversedAmount = reversalsList.reduce((acc: number, r: any) => acc + (r.amount || 0), 0);
    const originalAmount = op.originalAmount || op.amount;
    const remainingAmount = Math.max(0, originalAmount - totalReversedAmount);

    const reversalsData: IStripeReversalItem[] = reversalsList.map((r: any) => ({
      stripeReversalId: r.id,
      amount: r.amount,
      reason: r.description || r.metadata?.reason || 'REVERSAL',
      createdAt: new Date((r.created || Math.floor(Date.now() / 1000)) * 1000),
    }));

    const reconciliationState =
      remainingAmount === 0 ? 'FULLY_REVERSED' : totalReversedAmount > 0 ? 'PARTIALLY_REVERSED' : 'NONE';

    await TransferOperation.updateOne(
      { _id: op._id },
      {
        $set: {
          reversedAmount: totalReversedAmount,
          remainingAmount: remainingAmount,
          reversals: reversalsData,
          status: 'REVERSED',
          reconciliationState: reconciliationState,
        },
      }
    );
  }
}

export const marketplaceTransferService = new MarketplaceTransferService();
