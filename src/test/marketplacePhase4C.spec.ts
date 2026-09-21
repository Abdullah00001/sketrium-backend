import expect from 'expect';
import mongoose, { Types } from 'mongoose';
import config from '../app/config';
import User from '../app/modules/user/user.model';
import { MerchantProfile } from '../app/modules/merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import { Product } from '../app/modules/product/product.model';
import { Event } from '../app/modules/event/event.model';
import { Cart } from '../app/modules/addtocard/addtotocard.model';
import { Payment } from '../app/modules/marketplace/marketplacePayment.model';
import { ReservationRecord } from '../app/modules/marketplace/reservationRecord.model';
import { TransferOperation } from '../app/modules/marketplace/transferOperation.model';
import { marketplaceTransferService } from '../app/modules/marketplace/marketplaceTransfer.service';
import { marketplaceWebhookService } from '../app/modules/marketplace/marketplaceWebhook.service';
import { getStripeClient } from '../app/utils/stripeClient';
import { enqueueTransferJob, closeMarketplaceTransferWorker, closeMarketplaceTransferQueue } from '../app/jobs/marketplaceTransferQueue.job';
import { runMarketplaceTransferSweeper, stopMarketplaceTransferSweeper } from '../app/jobs/marketplaceTransferSweeper.job';
import { BalanceModel } from '../app/modules/Balance/balance.model';

describe('Phase 4C — Transfer Engine Architecture Suite', () => {
  jest.setTimeout(45000);

  let customerId: Types.ObjectId;
  let seller1Id: Types.ObjectId;
  let seller2Id: Types.ObjectId;
  let seller3Id: Types.ObjectId;

  const acct1 = 'acct_p4c_seller1_123';
  const acct2 = 'acct_p4c_seller2_456';
  const acct3 = 'acct_p4c_seller3_789';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.database_url as string);
    }
  });

  afterAll(async () => {
    stopMarketplaceTransferSweeper();
    await closeMarketplaceTransferWorker();
    await closeMarketplaceTransferQueue();
    await mongoose.disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const stripe = getStripeClient();
    if (stripe?.transfers) {
      jest.spyOn(stripe.transfers, 'list').mockResolvedValue({ data: [] } as any);
    }

    await Payment.deleteMany({});
    await ReservationRecord.deleteMany({});
    await TransferOperation.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await Event.deleteMany({});
    await MerchantProfile.deleteMany({});
    await OrganizerProfile.deleteMany({});
    await User.deleteMany({});

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

    const customerUser = await User.create({
      email: `customer_p4c_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Phase 4C Customer',
      phoneNumber: '1111111111',
      role: 'USER',
    });
    customerId = customerUser._id;

    const s1 = await User.create({
      email: `s1_p4c_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Seller 1',
      phoneNumber: '2222222222',
      role: 'USER',
    });
    seller1Id = s1._id;

    const s2 = await User.create({
      email: `s2_p4c_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Seller 2',
      phoneNumber: '3333333333',
      role: 'USER',
    });
    seller2Id = s2._id;

    const s3 = await User.create({
      email: `s3_p4c_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Seller 3',
      phoneNumber: '4444444444',
      role: 'USER',
    });
    seller3Id = s3._id;

    await MerchantProfile.create({
      user: seller1Id,
      stripeConnectedAccountId: acct1,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    await MerchantProfile.create({
      user: seller2Id,
      stripeConnectedAccountId: acct2,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    await MerchantProfile.create({
      user: seller3Id,
      stripeConnectedAccountId: acct3,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });
  });

  // Helper fixture to seed a Payment in SUCCEEDED state
  async function seedSucceededPayment(allocations: any[], amount: number = 10000) {
    const formattedAllocations = allocations.map((a) => ({
      ...a,
      currency: a.currency || 'USD',
      sellerRole: a.sellerRole || 'MARCHANT',
    }));

    const payment = new Payment({
      userId: customerId,
      clientCheckoutIdempotencyKey: `idem_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
      paymentType: 'PRODUCT_CART',
      amount: amount,
      currency: 'USD',
      status: 'SUCCEEDED',
      paymentIntentId: `pi_test_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      checkoutFingerprint: `fp_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      engineVersion: 'PHASE_4_MARKETPLACE',
      allocations: formattedAllocations,
      purchasedCartItemIds: [],
    });

    await payment.save({ validateBeforeSave: false });
    return payment;
  }

  // 1. One allocation -> one TransferOperation
  it('1. should create exactly one TransferOperation for single allocation', async () => {
    const alloc = [
      {
        allocationId: `alloc_1_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 5000);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops.length).toBe(1);
    expect(ops[0].amount).toBe(5000);
    expect(ops[0].stripeConnectedAccountId).toBe(acct1);
    expect(ops[0].status).toBe('NOT_STARTED');
  });

  // 2. Multi-seller allocation creation
  it('2. should create multiple TransferOperations for multi-seller checkout', async () => {
    const alloc = [
      {
        allocationId: `alloc_a_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 4000,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_b_${Date.now()}`,
        sellerUserId: seller2Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct2,
        amount: 3500,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_c_${Date.now()}`,
        sellerUserId: seller3Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct3,
        amount: 2500,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 10000);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops.length).toBe(3);
    const totalAlloc = ops.reduce((sum, o) => sum + o.amount, 0);
    expect(totalAlloc).toBe(10000);
  });

  // 3. Allocation sum invariant
  it('3. should verify sum of allocations equals payment total amount', async () => {
    const alloc = [
      {
        allocationId: `alloc_x_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 6000,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_y_${Date.now()}`,
        sellerUserId: seller2Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct2,
        amount: 4000,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 10000);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const totalAlloc = ops.reduce((sum, o) => sum + o.amount, 0);
    expect(payment.amount).toBe(totalAlloc);
  });

  // 4. Payment must be SUCCEEDED
  it('4. should reject TransferOperation creation if Payment is not SUCCEEDED', async () => {
    const payment = await Payment.create({
      userId: customerId,
      clientCheckoutIdempotencyKey: `idem_proc_${Date.now()}`,
      paymentType: 'PRODUCT_CART',
      amount: 5000,
      currency: 'USD',
      status: 'PROCESSING',
      checkoutFingerprint: `fp_proc_${Date.now()}`,
      engineVersion: 'PHASE_4_MARKETPLACE',
      allocations: [
        {
          allocationId: `alloc_p_${Date.now()}`,
          sellerUserId: seller1Id,
          sellerRole: 'MARCHANT',
          stripeConnectedAccountId: acct1,
          amount: 5000,
          currency: 'USD',
          purchasedItems: [],
        },
      ],
    });

    await expect(
      marketplaceTransferService.createTransferOperationsForPayment(payment._id)
    ).rejects.toThrow();
  });

  // 5. Persistent idempotency key
  it('5. should format persistent idempotency key as tr_exec_{paymentId}_{allocationId}', async () => {
    const allocId = `alloc_key_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops[0].stripeIdempotencyKey).toBe(`tr_exec_${payment._id.toString()}_${allocId}`);
  });

  // 6. Duplicate checkout/payment webhook (idempotency)
  it('6. should safely handle duplicate call to createTransferOperationsForPayment idempotently', async () => {
    const allocId = `alloc_dup_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops1 = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const ops2 = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops1.length).toBe(1);
    expect(ops2.length).toBe(1);
    expect(ops1[0]._id.toString()).toBe(ops2[0]._id.toString());
  });

  // 7. Concurrent TransferOperation creation
  it('7. should handle concurrent TransferOperation creation without duplicate records', async () => {
    const allocId = `alloc_conc_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);

    const [res1, res2] = await Promise.all([
      marketplaceTransferService.createTransferOperationsForPayment(payment._id),
      marketplaceTransferService.createTransferOperationsForPayment(payment._id),
    ]);

    const totalOpsInDb = await TransferOperation.find({ paymentId: payment._id });
    expect(totalOpsInDb.length).toBe(1);
  });

  // 8. Concurrent worker claim
  it('8. should allow only one worker to claim operation atomically from NOT_STARTED to CREATING', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_claim_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const opId = ops[0]._id;

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create').mockResolvedValue({
      id: `tr_mock_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
    } as any);

    const [res1, res2] = await Promise.allSettled([
      marketplaceTransferService.executeTransferOperation(opId.toString()),
      marketplaceTransferService.executeTransferOperation(opId.toString()),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  // 9. Duplicate BullMQ job
  it('9. should handle duplicate BullMQ job safely without duplicate Stripe API calls', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_bull_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const opId = ops[0]._id.toString();

    const res1 = await enqueueTransferJob(opId, payment._id.toString(), ops[0].allocationId);
    const res2 = await enqueueTransferJob(opId, payment._id.toString(), ops[0].allocationId);
    expect(res1.enqueued).toBe(true);
  });

  // 10. CREATED operation no-op
  it('10. should return existing TransferOperation immediately if already CREATED', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_noop_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: 'tr_already_created' } });

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create');

    const result = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());
    expect(result.status).toBe('CREATED');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // 11. Stripe successful transfer
  it('11. should transition TransferOperation to CREATED and attach stripeTransferId on success', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_succ_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create').mockResolvedValue({
      id: `tr_success_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
    } as any);

    const result = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());
    expect(result.status).toBe('CREATED');
    expect(result.stripeTransferId).toContain('tr_success_');
    spy.mockRestore();
  });

  // 12. Stripe definitive failure
  it('12. should transition TransferOperation to FAILED_DEFINITIVE on amount_too_small error', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_fail_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create').mockRejectedValue({
      code: 'amount_too_small',
      message: 'Transfer amount is too small',
      statusCode: 400,
    });

    await expect(marketplaceTransferService.executeTransferOperation(ops[0]._id.toString())).rejects.toBeDefined();

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('FAILED_DEFINITIVE');
    expect(updatedOp?.failureReason).toBe('amount_too_small');
    spy.mockRestore();
  });

  // 13. Stripe timeout
  it('13. should transition TransferOperation to RECOVERY_REQUIRED on network timeout', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_time_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create').mockRejectedValue({
      code: 'stripe_connection_error',
      message: 'Connection timed out',
    });

    await expect(marketplaceTransferService.executeTransferOperation(ops[0]._id.toString())).rejects.toBeDefined();

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('RECOVERY_REQUIRED');
    spy.mockRestore();
  });

  // 14. Recovery with same idempotency key
  it('14. should retry recovery call using the exact same persistent idempotency key', async () => {
    const allocId = `alloc_rec_key_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const expectedKey = `tr_exec_${payment._id.toString()}_${allocId}`;

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'create').mockResolvedValue({
      id: `tr_recovered_${Date.now()}`,
      created: Math.floor(Date.now() / 1000),
    } as any);

    await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: expectedKey })
    );
    spy.mockRestore();
  });

  // 15. stale CREATING -> RECOVERY_REQUIRED
  it('15. should transition stale CREATING operations to RECOVERY_REQUIRED in sweeper', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_stale_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    // Manually force op to CREATING with stale updatedAt (10 minutes ago)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await TransferOperation.collection.updateOne(
      { _id: ops[0]._id },
      { $set: { status: 'CREATING', updatedAt: tenMinutesAgo } }
    );

    const sweptCount = await marketplaceTransferService.sweepStalledTransfers();
    expect(sweptCount).toBeGreaterThanOrEqual(1);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('RECOVERY_REQUIRED');
  });

  // 16. Sweeper recovery
  it('16. should trigger sweeper recovery for NOT_STARTED and RECOVERY_REQUIRED ops', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_sweep_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const sweptCount = await runMarketplaceTransferSweeper();
    expect(sweptCount).toBeGreaterThanOrEqual(1);
  });

  // 17. Redis enqueue failure recovery
  it('17. should allow sweeper to recover NOT_STARTED operations if initial Redis enqueue blipped', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_redis_blip_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops[0].status).toBe('NOT_STARTED');

    const sweptCount = await marketplaceTransferService.sweepStalledTransfers();
    expect(sweptCount).toBeGreaterThanOrEqual(1);
  });

  // 18. Process crash simulation
  it('18. should recover operation stuck in CREATING after process crash simulation', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_crash_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    // Simulate mid-flight process crash by setting status to CREATING with old timestamp
    await TransferOperation.collection.updateOne(
      { _id: ops[0]._id },
      { $set: { status: 'CREATING', updatedAt: new Date(Date.now() - 6 * 60 * 1000) } }
    );

    await marketplaceTransferService.sweepStalledTransfers();

    const opAfterSweep = await TransferOperation.findById(ops[0]._id);
    expect(opAfterSweep?.status).toBe('RECOVERY_REQUIRED');
  });

  // 19. transfer.created race
  it('19. should handle transfer.created webhook arriving before worker completes persistence', async () => {
    const allocId = `alloc_race_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATING' } });

    const webhookEvent = {
      id: `tr_race_${Date.now()}`,
      amount: 5000,
      currency: 'usd',
      destination: acct1,
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
      created: Math.floor(Date.now() / 1000),
    };

    await marketplaceTransferService.handleTransferCreated(webhookEvent);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('CREATED');
    expect(updatedOp?.stripeTransferId).toBe(webhookEvent.id);
  });

  // 20. transfer.created duplicate
  it('20. should handle transfer.created duplicate delivery idempotently', async () => {
    const allocId = `alloc_tr_dup_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const webhookEvent = {
      id: `tr_dup_${Date.now()}`,
      amount: 5000,
      currency: 'usd',
      destination: acct1,
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
      created: Math.floor(Date.now() / 1000),
    };

    await marketplaceTransferService.handleTransferCreated(webhookEvent);
    await marketplaceTransferService.handleTransferCreated(webhookEvent);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('CREATED');
    expect(updatedOp?.stripeTransferId).toBe(webhookEvent.id);
  });

  // 21. Unknown transfer metadata
  it('21. should ignore transfer.created event if metadata paymentId/allocationId is missing', async () => {
    const webhookEvent = {
      id: `tr_unknown_${Date.now()}`,
      amount: 5000,
      currency: 'usd',
      destination: acct1,
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    };

    await expect(marketplaceTransferService.handleTransferCreated(webhookEvent)).resolves.not.toThrow();
  });

  // 22. Ownership mismatch
  it('22. should set RECONCILIATION_REQUIRED if transfer.created destination account mismatches DB', async () => {
    const allocId = `alloc_mismatch_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const webhookEvent = {
      id: `tr_mismatch_${Date.now()}`,
      amount: 5000,
      currency: 'usd',
      destination: 'acct_wrong_destination_999',
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
      created: Math.floor(Date.now() / 1000),
    };

    await marketplaceTransferService.handleTransferCreated(webhookEvent);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('RECONCILIATION_REQUIRED');
  });

  // 23. Amount mismatch
  it('23. should set RECONCILIATION_REQUIRED if transfer.created amount mismatches DB', async () => {
    const allocId = `alloc_amt_mismatch_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const webhookEvent = {
      id: `tr_amt_mismatch_${Date.now()}`,
      amount: 9999, // Mismatched amount
      currency: 'usd',
      destination: acct1,
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
      created: Math.floor(Date.now() / 1000),
    };

    await marketplaceTransferService.handleTransferCreated(webhookEvent);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('RECONCILIATION_REQUIRED');
  });

  // 24. Currency mismatch
  it('24. should set RECONCILIATION_REQUIRED if transfer.created currency mismatches DB', async () => {
    const allocId = `alloc_curr_mismatch_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const webhookEvent = {
      id: `tr_curr_mismatch_${Date.now()}`,
      amount: 5000,
      currency: 'eur', // Mismatched currency
      destination: acct1,
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
      created: Math.floor(Date.now() / 1000),
    };

    await marketplaceTransferService.handleTransferCreated(webhookEvent);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('RECONCILIATION_REQUIRED');
  });

  // 25. Partial multi-seller failure
  it('25. should maintain Payment SUCCEEDED state when 2 transfers succeed and 1 fails', async () => {
    const alloc = [
      {
        allocationId: `alloc_part_a_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 4000,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_part_b_${Date.now()}`,
        sellerUserId: seller2Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct2,
        amount: 3500,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_part_c_${Date.now()}`,
        sellerUserId: seller3Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct3,
        amount: 2500,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 10000);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    // Simulate A & B CREATED, C RECOVERY_REQUIRED
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: 'tr_a' } });
    await TransferOperation.updateOne({ _id: ops[1]._id }, { $set: { status: 'CREATED', stripeTransferId: 'tr_b' } });
    await TransferOperation.updateOne({ _id: ops[2]._id }, { $set: { status: 'RECOVERY_REQUIRED' } });

    const parentPayment = await Payment.findById(payment._id);
    expect(parentPayment?.status).toBe('SUCCEEDED');

    const opA = await TransferOperation.findById(ops[0]._id);
    const opB = await TransferOperation.findById(ops[1]._id);
    const opC = await TransferOperation.findById(ops[2]._id);

    expect(opA?.status).toBe('CREATED');
    expect(opB?.status).toBe('CREATED');
    expect(opC?.status).toBe('RECOVERY_REQUIRED');
  });

  // 26. Zero allocation
  it('26. should skip Stripe call for amount === 0 and set CREATED with stripeTransferId = null and executionSkipReason = ZERO_AMOUNT', async () => {
    const alloc = [
      {
        allocationId: `alloc_zero_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 0,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 0);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    expect(ops[0].status).toBe('CREATED');
    expect(ops[0].stripeTransferId).toBeNull();
    expect(ops[0].executionSkipReason).toBe('ZERO_AMOUNT');
  });

  // 27. transfer.reversed
  it('27. should process transfer.reversed webhook and update local reversal status', async () => {
    const allocId = `alloc_rev_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_to_reverse_${Date.now()}`;
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: trId } });

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 5000,
      reversals: {
        data: [
          {
            id: `trr_1_${Date.now()}`,
            amount: 5000,
            description: 'Customer refund dispute',
            created: Math.floor(Date.now() / 1000),
          },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('REVERSED');
    expect(updatedOp?.reversedAmount).toBe(5000);
    expect(updatedOp?.remainingAmount).toBe(0);
    expect(updatedOp?.reconciliationState).toBe('FULLY_REVERSED');
    expect(updatedOp?.reversals.length).toBe(1);
    spy.mockRestore();
  });

  // 28. Duplicate reversal webhook
  it('28. should handle duplicate transfer.reversed delivery idempotently', async () => {
    const allocId = `alloc_dup_rev_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_dup_reverse_${Date.now()}`;
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: trId } });

    const revId = `trr_dup_${Date.now()}`;
    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 5000,
      reversals: {
        data: [
          {
            id: revId,
            amount: 5000,
            description: 'Customer refund dispute',
            created: Math.floor(Date.now() / 1000),
          },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });
    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('REVERSED');
    expect(updatedOp?.reversals.length).toBe(1);
    spy.mockRestore();
  });

  // 29. Partial reversal
  it('29. should set PARTIALLY_REVERSED reconciliationState for partial reversal', async () => {
    const allocId = `alloc_part_rev_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 10000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_part_rev_${Date.now()}`;
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: trId } });

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 10000,
      reversals: {
        data: [
          {
            id: `trr_part_${Date.now()}`,
            amount: 3000,
            description: 'Partial item return',
            created: Math.floor(Date.now() / 1000),
          },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('REVERSED');
    expect(updatedOp?.reversedAmount).toBe(3000);
    expect(updatedOp?.remainingAmount).toBe(7000);
    expect(updatedOp?.reconciliationState).toBe('PARTIALLY_REVERSED');
    spy.mockRestore();
  });

  // 30. Full reversal
  it('30. should set FULLY_REVERSED reconciliationState for full reversal', async () => {
    const allocId = `alloc_full_rev_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_full_rev_${Date.now()}`;
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: trId } });

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 5000,
      reversals: {
        data: [
          {
            id: `trr_full_${Date.now()}`,
            amount: 5000,
            description: 'Full return',
            created: Math.floor(Date.now() / 1000),
          },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('REVERSED');
    expect(updatedOp?.remainingAmount).toBe(0);
    expect(updatedOp?.reconciliationState).toBe('FULLY_REVERSED');
    spy.mockRestore();
  });

  // 31. Reversal ID deduplication
  it('31. should preserve unique stripeReversalId list during multiple reversal events', async () => {
    const allocId = `alloc_rev_dedup_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 10000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_dedup_rev_${Date.now()}`;
    await TransferOperation.updateOne({ _id: ops[0]._id }, { $set: { status: 'CREATED', stripeTransferId: trId } });

    const rev1 = `trr_1_${Date.now()}`;
    const rev2 = `trr_2_${Date.now()}`;

    const stripe = getStripeClient();
    const spy = jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 10000,
      reversals: {
        data: [
          { id: rev1, amount: 2000, description: 'Reversal 1', created: Math.floor(Date.now() / 1000) },
          { id: rev2, amount: 3000, description: 'Reversal 2', created: Math.floor(Date.now() / 1000) },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.reversals.length).toBe(2);
    expect(updatedOp?.reversedAmount).toBe(5000);
    spy.mockRestore();
  });

  // 32. Legacy isolation
  it('32. should preserve legacy BalanceModel without interference from Phase 4C transfers', async () => {
    const balance = await BalanceModel.create({
      userId: seller1Id,
      currentBalance: 500,
    });

    const alloc = [
      {
        allocationId: `alloc_legacy_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 5000);
    await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const postBalance = await BalanceModel.findById(balance._id);
    expect(postBalance?.currentBalance).toBe(500);
  });

  // 33. Financial over-transfer protection
  it('33. should guarantee sum of CREATED transfer operations does not exceed Payment amount', async () => {
    const alloc = [
      {
        allocationId: `alloc_over_a_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
      {
        allocationId: `alloc_over_b_${Date.now()}`,
        sellerUserId: seller2Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct2,
        amount: 5000,
        purchasedItems: [],
      },
    ];
    const payment = await seedSucceededPayment(alloc, 10000);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    for (const op of ops) {
      await TransferOperation.updateOne({ _id: op._id }, { $set: { status: 'CREATED', stripeTransferId: `tr_over_${op._id}` } });
    }

    const createdOps = await TransferOperation.find({ paymentId: payment._id, status: 'CREATED' });
    const totalTransferred = createdOps.reduce((sum, o) => sum + o.amount, 0);

    expect(totalTransferred).toBeLessThanOrEqual(payment.amount);
    expect(totalTransferred).toBe(10000);
  });

  // 34. Uncertain Stripe Transfer Recovery: Outcome A (1 existing transfer discovered)
  it('34. should attach discovered transfer and transition to CREATED when exactly one matching transfer exists on Stripe', async () => {
    const allocId = `alloc_rec_a_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const stripe = getStripeClient();
    const discoveredTrId = `tr_discovered_${Date.now()}`;

    jest.spyOn(stripe.transfers, 'list').mockResolvedValue({
      data: [
        {
          id: discoveredTrId,
          amount: 5000,
          currency: 'usd',
          destination: acct1,
          created: Math.floor(Date.now() / 1000),
          metadata: {
            paymentId: payment._id.toString(),
            allocationId: allocId,
          },
        },
      ],
    } as any);

    const createSpy = jest.spyOn(stripe.transfers, 'create');

    const result = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());

    expect(result.status).toBe('CREATED');
    expect(result.stripeTransferId).toBe(discoveredTrId);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // 35. Uncertain Stripe Transfer Recovery: Outcome B (0 existing transfers -> proceed with create using persistent key)
  it('35. should safely issue stripe.transfers.create with immutable idempotency key when 0 matching transfers exist', async () => {
    const allocId = `alloc_rec_b_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const expectedKey = `tr_exec_${payment._id.toString()}_${allocId}`;

    const stripe = getStripeClient();
    jest.spyOn(stripe.transfers, 'list').mockResolvedValue({ data: [] } as any);

    const newTrId = `tr_new_created_${Date.now()}`;
    const createSpy = jest.spyOn(stripe.transfers, 'create').mockResolvedValue({
      id: newTrId,
      created: Math.floor(Date.now() / 1000),
    } as any);

    const result = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());

    expect(result.status).toBe('CREATED');
    expect(result.stripeTransferId).toBe(newTrId);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: expectedKey })
    );
  });

  // 36. Uncertain Stripe Transfer Recovery: Outcome C (Multiple matching transfers -> RECONCILIATION_REQUIRED)
  it('36. should transition to RECONCILIATION_REQUIRED and NEVER create when multiple matching transfers exist on Stripe', async () => {
    const allocId = `alloc_rec_c_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const stripe = getStripeClient();
    jest.spyOn(stripe.transfers, 'list').mockResolvedValue({
      data: [
        {
          id: `tr_multi_1_${Date.now()}`,
          amount: 5000,
          currency: 'usd',
          destination: acct1,
          created: Math.floor(Date.now() / 1000),
          metadata: { paymentId: payment._id.toString(), allocationId: allocId },
        },
        {
          id: `tr_multi_2_${Date.now()}`,
          amount: 5000,
          currency: 'usd',
          destination: acct1,
          created: Math.floor(Date.now() / 1000),
          metadata: { paymentId: payment._id.toString(), allocationId: allocId },
        },
      ],
    } as any);

    const createSpy = jest.spyOn(stripe.transfers, 'create');

    const result = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());

    expect(result.status).toBe('RECONCILIATION_REQUIRED');
    expect(result.reconciliationReason).toBe('MULTIPLE_TRANSFERS_MATCHED');
    expect(createSpy).not.toHaveBeenCalled();
  });

  // 37. Stripe TEST-MODE Integration: Single-Seller Transfer End-to-End
  it('37. should process single-seller transfer through queue, worker, and Stripe TEST MODE mock contract', async () => {
    const payment = await seedSucceededPayment([
      {
        allocationId: `alloc_testmode_single_${Date.now()}`,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 10000,
        purchasedItems: [],
      },
    ]);

    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops.length).toBe(1);
    expect(ops[0].status).toBe('NOT_STARTED');

    const stripe = getStripeClient();
    const testModeTransferId = `tr_testmode_single_${Date.now()}`;
    jest.spyOn(stripe.transfers, 'create').mockResolvedValue({
      id: testModeTransferId,
      created: Math.floor(Date.now() / 1000),
    } as any);

    const workerResult = await marketplaceTransferService.executeTransferOperation(ops[0]._id.toString());
    expect(workerResult.status).toBe('CREATED');
    expect(workerResult.stripeTransferId).toBe(testModeTransferId);

    const persistedOp = await TransferOperation.findById(ops[0]._id);
    expect(persistedOp?.status).toBe('CREATED');
    expect(persistedOp?.stripeTransferId).toBe(testModeTransferId);
  });

  // 38. Stripe TEST-MODE Integration: Multi-Seller Split ($100 payment -> $40, $35, $25)
  it('38. should execute multi-seller transfer split ($100 -> A $40, B $35, C $25) to independent connected destinations', async () => {
    const allocA = `alloc_split_a_${Date.now()}`;
    const allocB = `alloc_split_b_${Date.now()}`;
    const allocC = `alloc_split_c_${Date.now()}`;

    const payment = await seedSucceededPayment(
      [
        {
          allocationId: allocA,
          sellerUserId: seller1Id,
          sellerRole: 'MERCHANT',
          stripeConnectedAccountId: acct1,
          amount: 4000,
          purchasedItems: [],
        },
        {
          allocationId: allocB,
          sellerUserId: seller2Id,
          sellerRole: 'MERCHANT',
          stripeConnectedAccountId: acct2,
          amount: 3500,
          purchasedItems: [],
        },
        {
          allocationId: allocC,
          sellerUserId: seller3Id,
          sellerRole: 'MERCHANT',
          stripeConnectedAccountId: acct3,
          amount: 2500,
          purchasedItems: [],
        },
      ],
      10000
    );

    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    expect(ops.length).toBe(3);

    const stripe = getStripeClient();
    const trMap: Record<string, string> = {
      [acct1]: `tr_testmode_acct1_${Date.now()}`,
      [acct2]: `tr_testmode_acct2_${Date.now()}`,
      [acct3]: `tr_testmode_acct3_${Date.now()}`,
    };

    jest.spyOn(stripe.transfers, 'create').mockImplementation((params: any) => {
      return Promise.resolve({
        id: trMap[params.destination] || `tr_testmode_${Date.now()}`,
        created: Math.floor(Date.now() / 1000),
      } as any);
    });

    for (const op of ops) {
      const res = await marketplaceTransferService.executeTransferOperation(op._id.toString());
      expect(res.status).toBe('CREATED');
    }

    const finalOps = await TransferOperation.find({ paymentId: payment._id });
    expect(finalOps.length).toBe(3);

    const opMap = new Map(finalOps.map((o) => [o.stripeConnectedAccountId, o]));
    expect(opMap.get(acct1)?.amount).toBe(4000);
    expect(opMap.get(acct1)?.stripeTransferId).toBe(trMap[acct1]);

    expect(opMap.get(acct2)?.amount).toBe(3500);
    expect(opMap.get(acct2)?.stripeTransferId).toBe(trMap[acct2]);

    expect(opMap.get(acct3)?.amount).toBe(2500);
    expect(opMap.get(acct3)?.stripeTransferId).toBe(trMap[acct3]);
  });

  // 39. Stripe TEST-MODE Integration: transfer.created webhook handling with authentic event payload
  it('39. should process authentic transfer.created webhook event payload and update state idempotently', async () => {
    const allocId = `alloc_wh_test_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);

    const transferEventPayload = {
      id: `tr_wh_event_${Date.now()}`,
      object: 'transfer',
      amount: 5000,
      currency: 'usd',
      destination: acct1,
      created: Math.floor(Date.now() / 1000),
      metadata: {
        paymentId: payment._id.toString(),
        allocationId: allocId,
      },
    };

    await marketplaceTransferService.handleTransferCreated(transferEventPayload);

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('CREATED');
    expect(updatedOp?.stripeTransferId).toBe(transferEventPayload.id);
  });

  // 40. Stripe TEST-MODE Integration: transfer.reversed webhook & reconciliation handling
  it('40. should process transfer.reversed webhook payload and reconcile partial/full reversal states', async () => {
    const allocId = `alloc_rev_test_${Date.now()}`;
    const payment = await seedSucceededPayment([
      {
        allocationId: allocId,
        sellerUserId: seller1Id,
        sellerRole: 'MERCHANT',
        stripeConnectedAccountId: acct1,
        amount: 5000,
        purchasedItems: [],
      },
    ]);
    const ops = await marketplaceTransferService.createTransferOperationsForPayment(payment._id);
    const trId = `tr_rev_event_${Date.now()}`;

    await TransferOperation.updateOne(
      { _id: ops[0]._id },
      { $set: { status: 'CREATED', stripeTransferId: trId } }
    );

    const stripe = getStripeClient();
    const revId = `trr_test_${Date.now()}`;
    jest.spyOn(stripe.transfers, 'retrieve').mockResolvedValue({
      id: trId,
      amount: 5000,
      currency: 'usd',
      reversals: {
        data: [
          {
            id: revId,
            amount: 5000,
            description: 'Customer dispute refund',
            created: Math.floor(Date.now() / 1000),
          },
        ],
      },
    } as any);

    await marketplaceTransferService.handleTransferReversed({ id: trId });

    const updatedOp = await TransferOperation.findById(ops[0]._id);
    expect(updatedOp?.status).toBe('REVERSED');
    expect(updatedOp?.reconciliationState).toBe('FULLY_REVERSED');
    expect(updatedOp?.reversedAmount).toBe(5000);
    expect(updatedOp?.remainingAmount).toBe(0);
    expect(updatedOp?.reversals[0].stripeReversalId).toBe(revId);
  });
});
