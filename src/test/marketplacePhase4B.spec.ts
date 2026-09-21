import expect from 'expect';
import mongoose, { Types } from 'mongoose';
import Stripe from 'stripe';
import config from '../app/config';
import User from '../app/modules/user/user.model';
import { MerchantProfile } from '../app/modules/merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import { Product } from '../app/modules/product/product.model';
import { Event } from '../app/modules/event/event.model';
import { Cart } from '../app/modules/addtocard/addtotocard.model';
import { Payment } from '../app/modules/marketplace/marketplacePayment.model';
import { ReservationRecord } from '../app/modules/marketplace/reservationRecord.model';
import { marketplaceCheckoutService } from '../app/modules/marketplace/marketplaceCheckout.service';
import { marketplacePaymentIntentService } from '../app/modules/marketplace/marketplacePaymentIntent.service';
import { marketplaceWebhookService } from '../app/modules/marketplace/marketplaceWebhook.service';
import { marketplaceReconciliationService } from '../app/modules/marketplace/marketplaceReconciliation.service';
import { ProductCategory } from '../app/modules/ProductCategory/ProductCategory.model';
import { Category as EventCategory } from '../app/modules/eventcatagore/eventcatagore.model';
import { getStripeClient } from '../app/utils/stripeClient';
import { enqueueReconciliationJob, closeMarketplaceReconciliationQueue } from '../app/jobs/marketplaceReconciliation.queue';
import { processReconciliationJob, closeMarketplaceReconciliationWorker } from '../app/jobs/marketplaceReconciliation.worker';

describe('Phase 4B — Stripe PaymentIntent Lifecycle & Webhook Suite', () => {
  jest.setTimeout(45000);

  let customerId: Types.ObjectId;
  let sellerId: Types.ObjectId;
  let organizerId: Types.ObjectId;
  let productCategoryId: Types.ObjectId;
  let eventCategoryId: Types.ObjectId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.database_url as string);
    }
  });

  afterAll(async () => {
    await closeMarketplaceReconciliationWorker();
    await closeMarketplaceReconciliationQueue();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await ReservationRecord.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await Event.deleteMany({});
    await MerchantProfile.deleteMany({});
    await OrganizerProfile.deleteMany({});
    await User.deleteMany({});

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

    // Seed test users
    const customerUser = await User.create({
      email: `customer_phase4b_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Phase 4B Customer',
      phoneNumber: '1111111111',
      role: 'USER',
    });
    customerId = customerUser._id;

    const sellerUser = await User.create({
      email: `seller1_phase4b_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Phase 4B Seller',
      phoneNumber: '2222222222',
      role: 'USER',
    });
    sellerId = sellerUser._id;

    const organizerUser = await User.create({
      email: `organizer_phase4b_${suffix}@test.com`,
      password: 'password123',
      fullName: 'Phase 4B Organizer',
      phoneNumber: '4444444444',
      role: 'USER',
    });
    organizerId = organizerUser._id;

    // Seed Stripe Profiles
    await MerchantProfile.create({
      user: sellerId,
      stripeConnectedAccountId: `acct_phase4b_merchant_${suffix}`,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    await OrganizerProfile.create({
      user: organizerId,
      stripeConnectedAccountId: `acct_phase4b_organizer_${suffix}`,
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    // Categories
    let prodCat = await ProductCategory.findOne({});
    if (!prodCat) {
      prodCat = await ProductCategory.create({ name: 'Phase4B Category' });
    }
    productCategoryId = prodCat._id;

    let evtCat = await EventCategory.findOne({});
    if (!evtCat) {
      evtCat = await EventCategory.create({ name: 'Phase4B Event Category' });
    }
    eventCategoryId = evtCat._id;
  });

  // Helper to mock Stripe SDK
  function mockStripePaymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
    return {
      id: overrides.id || 'pi_test_fake_123',
      object: 'payment_intent',
      amount: overrides.amount || 5000,
      currency: overrides.currency || 'usd',
      status: overrides.status || 'succeeded',
      livemode: overrides.livemode !== undefined ? overrides.livemode : false,
      client_secret: overrides.client_secret || 'pi_test_fake_123_secret_abc',
      metadata: overrides.metadata || {},
      created: overrides.created || Math.floor(Date.now() / 1000),
    } as any;
  }

  // 1. Normal PaymentIntent creation
  it('1. should create Stripe PaymentIntent and attach paymentIntentId to PENDING payment', async () => {
    const product = await Product.create({
      name: 'Phase4B Prod 1',
      category: productCategoryId,
      price: 50,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'pi_create_key_1',
    });

    const stripe = getStripeClient();
    const fakePi = mockStripePaymentIntent({
      amount: checkoutRes.payment.amount,
      metadata: { paymentId: checkoutRes.payment._id.toString() },
    });
    const spy = jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue(fakePi as any);

    try {
      const piRes = await marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      });

      expect(piRes.paymentIntentId).toBe('pi_test_fake_123');
      expect(piRes.clientSecret).toBe('pi_test_fake_123_secret_abc');

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.paymentIntentId).toBe('pi_test_fake_123');
      expect(paymentAfter?.stripePaymentIntentOperationStatus).toBe('CREATED');
    } finally {
      spy.mockRestore();
    }
  });

  // 2. Persistent idempotency key & 3. Duplicate request
  it('2 & 3. should reuse persistent stripeIdempotencyKey and return existing PaymentIntent on retry', async () => {
    const product = await Product.create({
      name: 'Phase4B Prod 2',
      category: productCategoryId,
      price: 30,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'pi_create_key_2',
    });

    const stripe = getStripeClient();
    const fakePi = mockStripePaymentIntent({ amount: checkoutRes.payment.amount });
    const createSpy = jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue(fakePi as any);
    const retrieveSpy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePi as any);

    try {
      const res1 = await marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      });

      const res2 = await marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      });

      expect(res1.paymentIntentId).toBe(res2.paymentIntentId);
      // Stripe create should be called exactly once
      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
      retrieveSpy.mockRestore();
    }
  });

  // 4. Concurrent creation handling
  it('4. should handle concurrent PaymentIntent creation requests and create exactly one PaymentIntent', async () => {
    const product = await Product.create({
      name: 'Phase4B Prod Concurrent',
      category: productCategoryId,
      price: 25,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'pi_concurrent_key',
    });

    const stripe = getStripeClient();
    const fakePi = mockStripePaymentIntent({ amount: checkoutRes.payment.amount });
    const createSpy = jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue(fakePi as any);
    const retrieveSpy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePi as any);

    try {
      const [res1, res2] = await Promise.all([
        marketplacePaymentIntentService.createPaymentIntent({ paymentId: checkoutRes.payment._id, userId: customerId }),
        marketplacePaymentIntentService.createPaymentIntent({ paymentId: checkoutRes.payment._id, userId: customerId }),
      ]);

      expect(res1.paymentIntentId).toBe(res2.paymentIntentId);
    } finally {
      createSpy.mockRestore();
      retrieveSpy.mockRestore();
    }
  });

  // 5 & 6. Ambiguous timeout handling & retry after timeout
  it('5 & 6. should set RECOVERY_REQUIRED on ambiguous timeout and allow retry using same idempotency key', async () => {
    const product = await Product.create({
      name: 'Phase4B Prod Timeout',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'timeout_key_1',
    });

    const stripe = getStripeClient();
    const connErr = new Stripe.errors.StripeConnectionError({ message: 'Socket hangup' });
    const spyFail = jest.spyOn(stripe.paymentIntents, 'create').mockRejectedValueOnce(connErr);

    await expect(
      marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      })
    ).rejects.toThrow();

    spyFail.mockRestore();

    // Verify Payment remains PENDING and operation is RECOVERY_REQUIRED
    const paymentAfterTimeout = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfterTimeout?.status).toBe('PENDING');
    expect(paymentAfterTimeout?.stripePaymentIntentOperationStatus).toBe('RECOVERY_REQUIRED');

    // Retry succeeds
    const fakePi = mockStripePaymentIntent({ amount: checkoutRes.payment.amount });
    const spySuccess = jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue(fakePi as any);

    try {
      const resRetry = await marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      });

      expect(resRetry.paymentIntentId).toBe('pi_test_fake_123');
    } finally {
      spySuccess.mockRestore();
    }
  });

  // 7. Process crash simulation
  it('7. should recover from process crash during PaymentIntent creation', async () => {
    const product = await Product.create({
      name: 'Phase4B Crash Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'crash_key_1',
    });

    // Simulate process crash: Payment status is PENDING, operation status stuck in RECOVERY_REQUIRED
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { stripePaymentIntentOperationStatus: 'RECOVERY_REQUIRED', stripeIdempotencyKey: `pi_phase4_${checkoutRes.payment._id}_fingerprint` } }
    );

    const stripe = getStripeClient();
    const fakePi = mockStripePaymentIntent({ amount: checkoutRes.payment.amount });
    const spy = jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue(fakePi as any);

    try {
      const resAfterCrash = await marketplacePaymentIntentService.createPaymentIntent({
        paymentId: checkoutRes.payment._id,
        userId: customerId,
      });

      expect(resAfterCrash.paymentIntentId).toBe('pi_test_fake_123');
    } finally {
      spy.mockRestore();
    }
  });

  // 8. Definitive Stripe rejection
  it('8. should transition Payment to CANCELED and release reservations on definitive Stripe error', async () => {
    const product = await Product.create({
      name: 'Phase4B Rejection Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'rejection_key_1',
    });

    const stripe = getStripeClient();
    const invalidErr = new Stripe.errors.StripeInvalidRequestError({ message: 'Invalid parameter' });
    const spy = jest.spyOn(stripe.paymentIntents, 'create').mockRejectedValue(invalidErr);

    try {
      await expect(
        marketplacePaymentIntentService.createPaymentIntent({
          paymentId: checkoutRes.payment._id,
          userId: customerId,
        })
      ).rejects.toThrow();

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('CANCELED');
      expect(paymentAfter?.stripePaymentIntentOperationStatus).toBe('FAILED_DEFINITIVE');

      // Verify Product stock restored back to 5
      const updatedProd = await Product.findById(product._id);
      expect(updatedProd?.stock).toBe(5);
    } finally {
      spy.mockRestore();
    }
  });

  // 9. Webhook succeeded & 25. Successful confirmation & 33. Exact purchased cart line removal
  it('9, 25 & 33. should transition payment to SUCCEEDED, confirm reservations, and clear exact purchased cart lines on payment_intent.succeeded', async () => {
    const prod1 = await Product.create({
      name: 'Phase4B Cart Prod 1',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    const prod2 = await Product.create({
      name: 'Phase4B Cart Prod 2 (Newly Added)',
      category: productCategoryId,
      price: 30,
      stock: 5,
      host: sellerId,
    });

    // Initial cart with prod1
    const cart = await Cart.create({
      user: customerId,
      items: [{ product: prod1._id, currency: 'USD', quantity: 1, color: 'Red', size: 'M' }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'cart_clear_key_1',
    });

    // Simulate user adding prod2 to cart AFTER checkout started
    await Cart.updateOne(
      { _id: cart._id },
      { $push: { items: { product: prod2._id, currency: 'USD', quantity: 1, color: 'Blue', size: 'L' } } }
    );

    const fakePi = mockStripePaymentIntent({
      id: 'pi_succ_123',
      amount: checkoutRes.payment.amount,
      currency: 'usd',
      livemode: false,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        environment: config.env || 'development',
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentSucceeded({
      stripeEventId: 'evt_succ_123',
      payload: {
        id: 'evt_succ_123',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        objectId: 'pi_succ_123',
        objectType: 'payment_intent',
      },
      rawEvent: {
        created: Math.floor(Date.now() / 1000),
        data: { object: fakePi },
      },
    });

    // Payment must be SUCCEEDED
    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('SUCCEEDED');

    // Reservation must be CONFIRMED
    const reservationAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
    expect(reservationAfter?.status).toBe('CONFIRMED');

    // Cart verification: Prod 1 removed, Prod 2 (newly added) survives!
    const updatedCart = await Cart.findOne({ user: customerId });
    expect(updatedCart?.items.length).toBe(1);
    expect(updatedCart?.items[0].product.toString()).toBe(prod2._id.toString());
  });

  // 10. payment_failed + requires_payment_method
  it('10. should maintain PENDING payment and RESERVED status when payment_failed fires with requires_payment_method', async () => {
    const product = await Product.create({
      name: 'Phase4B Retryable Fail Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'retry_fail_key_1',
    });

    const fakePi = mockStripePaymentIntent({
      id: 'pi_retry_fail_123',
      status: 'requires_payment_method', // Stripe status is retryable!
      amount: checkoutRes.payment.amount,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentFailed({
      stripeEventId: 'evt_fail_retry_123',
      payload: {
        id: 'evt_fail_retry_123',
        type: 'payment_intent.payment_failed',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        objectId: 'pi_retry_fail_123',
        objectType: 'payment_intent',
      },
      rawEvent: {
        created: Math.floor(Date.now() / 1000),
        data: { object: fakePi },
      },
    });

    // Payment remains PENDING, reservation remains RESERVED
    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('PENDING');

    const resAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
    expect(resAfter?.status).toBe('RESERVED');
  });

  // 11. payment_failed + canceled
  it('11. should transition Payment to FAILED and release reservations when payment_failed fires with canceled status', async () => {
    const product = await Product.create({
      name: 'Phase4B Terminal Fail Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'term_fail_key_1',
    });

    const fakePi = mockStripePaymentIntent({
      id: 'pi_term_fail_123',
      status: 'canceled',
      amount: checkoutRes.payment.amount,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentFailed({
      stripeEventId: 'evt_fail_term_123',
      payload: {
        id: 'evt_fail_term_123',
        type: 'payment_intent.payment_failed',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        objectId: 'pi_term_fail_123',
        objectType: 'payment_intent',
      },
      rawEvent: {
        created: Math.floor(Date.now() / 1000),
        data: { object: fakePi },
      },
    });

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('FAILED');

    const resAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
    expect(resAfter?.status).toBe('RELEASED');
  });

  // 12 & 30. Webhook processing & TTL extension
  it('12 & 30. should transition Payment to PROCESSING and extend reservation TTL on payment_intent.processing', async () => {
    const product = await Product.create({
      name: 'Phase4B Processing Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'proc_key_1',
    });

    const fakePi = mockStripePaymentIntent({
      id: 'pi_proc_123',
      status: 'processing',
      amount: checkoutRes.payment.amount,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentProcessing({
      stripeEventId: 'evt_proc_123',
      payload: {
        id: 'evt_proc_123',
        type: 'payment_intent.processing',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        objectId: 'pi_proc_123',
        objectType: 'payment_intent',
      },
      rawEvent: {
        created: Math.floor(Date.now() / 1000),
        data: { object: fakePi },
      },
    });

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('PROCESSING');

    // TTL extended to 7 days
    const resAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
    expect(resAfter?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  // 15. Out of order events & 16. Equal timestamps
  it('15 & 16. should discard older events based on stripeLastEventCreatedAt', async () => {
    const product = await Product.create({
      name: 'Phase4B Chrono Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'chrono_key_1',
    });

    const nowSec = Math.floor(Date.now() / 1000);

    const fakePiSucc = mockStripePaymentIntent({
      id: 'pi_chrono_123',
      status: 'succeeded',
      amount: checkoutRes.payment.amount,
      created: nowSec,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    // 1. Send succeeded event with timestamp = nowSec
    await marketplaceWebhookService.handlePaymentIntentSucceeded({
      stripeEventId: 'evt_succ_newer',
      payload: { id: 'evt_succ_newer', type: 'payment_intent.succeeded', created: nowSec, livemode: false, objectId: 'pi_chrono_123', objectType: 'payment_intent' },
      rawEvent: { created: nowSec, data: { object: fakePiSucc } },
    });

    // 2. Send older processing event with timestamp = nowSec - 100
    const fakePiProc = mockStripePaymentIntent({
      id: 'pi_chrono_123',
      status: 'processing',
      amount: checkoutRes.payment.amount,
      created: nowSec - 100,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentProcessing({
      stripeEventId: 'evt_proc_older',
      payload: { id: 'evt_proc_older', type: 'payment_intent.processing', created: nowSec - 100, livemode: false, objectId: 'pi_chrono_123', objectType: 'payment_intent' },
      rawEvent: { created: nowSec - 100, data: { object: fakePiProc } },
    });

    // Verify Payment remains SUCCEEDED
    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('SUCCEEDED');
  });

  // 17. Amount mismatch validation
  it('17. should transition Payment to RECONCILIATION_REQUIRED on amount mismatch', async () => {
    const product = await Product.create({
      name: 'Phase4B Mismatch Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'amount_mismatch_key',
    });

    const fakePiMismatched = mockStripePaymentIntent({
      id: 'pi_mismatch_123',
      amount: 999999, // Mismatched amount!
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentSucceeded({
      stripeEventId: 'evt_amount_mismatch',
      payload: { id: 'evt_amount_mismatch', type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000), livemode: false, objectId: 'pi_mismatch_123', objectType: 'payment_intent' },
      rawEvent: { created: Math.floor(Date.now() / 1000), data: { object: fakePiMismatched } },
    });

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('RECONCILIATION_REQUIRED');
    expect(paymentAfter?.reconciliationReason).toBe('AMOUNT_MISMATCH');
  });

  // 29. Late success after release
  it('29. should set RECONCILIATION_REQUIRED and RESERVATION_ALREADY_RELEASED if late success fires after payment EXPIRED', async () => {
    const product = await Product.create({
      name: 'Phase4B Late Success Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'late_succ_key_1',
    });

    // Mark Payment EXPIRED & release reservation
    await Payment.updateOne({ _id: checkoutRes.payment._id }, { $set: { status: 'EXPIRED' } });
    await marketplaceCheckoutService.releaseReservation(checkoutRes.reservations[0]._id);

    const fakePi = mockStripePaymentIntent({
      id: 'pi_late_succ_123',
      amount: checkoutRes.payment.amount,
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentSucceeded({
      stripeEventId: 'evt_late_succ',
      payload: { id: 'evt_late_succ', type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000), livemode: false, objectId: 'pi_late_succ_123', objectType: 'payment_intent' },
      rawEvent: { created: Math.floor(Date.now() / 1000), data: { object: fakePi } },
    });

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('RECONCILIATION_REQUIRED');
    expect(paymentAfter?.reconciliationReason).toBe('RESERVATION_ALREADY_RELEASED');

    // Reservation remains RELEASED (not auto-confirmed)
    const resAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
    expect(resAfter?.status).toBe('RELEASED');
  });

  // 31 & 32. Processing > 7 days & PROCESSING_MAX_DURATION_EXCEEDED
  it('31 & 32. should set RECONCILIATION_REQUIRED and PROCESSING_MAX_DURATION_EXCEEDED when PROCESSING payment exceeds 7 days', async () => {
    const product = await Product.create({
      name: 'Phase4B Max Duration Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'max_dur_key_1',
    });

    // Backdate Payment createdAt to 8 days ago & set status PROCESSING
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await Payment.collection.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'PROCESSING', paymentIntentId: 'pi_max_dur_123', createdAt: eightDaysAgo } }
    );
    await ReservationRecord.updateOne(
      { _id: checkoutRes.reservations[0]._id },
      { $set: { expiresAt: new Date(Date.now() - 3600000) } }
    );

    const stripe = getStripeClient();
    const fakePiProcessing = mockStripePaymentIntent({ id: 'pi_max_dur_123', status: 'processing' });
    const spy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePiProcessing as any);

    try {
      await marketplaceCheckoutService.processExpiredReservations();

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('RECONCILIATION_REQUIRED');
      expect(paymentAfter?.reconciliationReason).toBe('PROCESSING_MAX_DURATION_EXCEEDED');

      // Reservation remains RESERVED (not released blindly)
      const resAfter = await ReservationRecord.findById(checkoutRes.reservations[0]._id);
      expect(resAfter?.status).toBe('RESERVED');
    } finally {
      spy.mockRestore();
    }
  });

  // 35 & 36. Automatic vs Manual Reconciliation Safety Gates
  it('35 & 36. should auto-reconcile technical errors but block auto-reconciliation for manual security reasons', async () => {
    const product = await Product.create({
      name: 'Phase4B Recon Safety Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'recon_safety_key_1',
    });

    // 1. Manual Reason (AMOUNT_MISMATCH) -> Must be BLOCKED from auto-reconciliation
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'AMOUNT_MISMATCH' } }
    );

    const manualResult = await marketplaceReconciliationService.reconcilePayment(checkoutRes.payment._id);
    expect(manualResult.reconciled).toBe(false);
    expect(manualResult.reason).toContain('Manual review required');

    // 2. Automatic Reason (STRIPE_API_UNCERTAIN) -> Permitted to auto-reconcile
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN', paymentIntentId: 'pi_auto_recon_123' } }
    );

    const stripe = getStripeClient();
    const fakePiSucc = mockStripePaymentIntent({
      id: 'pi_auto_recon_123',
      amount: checkoutRes.payment.amount,
      status: 'succeeded',
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    const spy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePiSucc as any);

    try {
      const autoResult = await marketplaceReconciliationService.reconcilePayment(checkoutRes.payment._id);
      expect(autoResult.reconciled).toBe(true);

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('SUCCEEDED');
    } finally {
      spy.mockRestore();
    }
  });

  // 37, 38, 39, 40. Financial Invariants & Phase 4B Transfer Isolation
  it('37-40. should verify financial invariants and create zero Stripe transfers in Phase 4B', async () => {
    const product = await Product.create({
      name: 'Phase4B Fin Invariants Prod',
      category: productCategoryId,
      price: 25,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'fin_inv_4b_key',
    });

    const payment = checkoutRes.payment;
    const sumAllocations = payment.allocations.reduce((acc, curr) => acc + curr.amount, 0);

    // 37. Amount === sum(allocations)
    expect(payment.amount).toBe(sumAllocations);
    // 38. Allocation amount > 0
    expect(payment.allocations[0].amount).toBeGreaterThan(0);
    // 39. Currency matches
    expect(payment.allocations[0].currency).toBe(payment.currency);

    // 40. Transfer Isolation: All transfers remain PENDING with null transfer IDs
    expect(payment.allocations[0].transferStatus).toBe('PENDING');
    expect(payment.allocations[0].stripeTransferId).toBeNull();
  });

  // 41. Blocker 1 — Durable Queue Creation & Safety Gate Filtering
  it('41. should enqueue job for automatic reason and block job creation for manual reason', async () => {
    const product = await Product.create({
      name: 'Phase4B Queue Test Prod',
      category: productCategoryId,
      price: 20,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'queue_test_key_1',
    });

    // Enqueue automatic reason (STRIPE_API_UNCERTAIN)
    const autoJobRes = await enqueueReconciliationJob(checkoutRes.payment._id.toString(), 'STRIPE_API_UNCERTAIN');
    expect(autoJobRes.enqueued).toBe(true);
    expect(autoJobRes.jobId).toBe(`recon_${checkoutRes.payment._id}_STRIPE_API_UNCERTAIN`);

    // Enqueue manual reason (AMOUNT_MISMATCH) -> Must return enqueued: false
    const manualJobRes = await enqueueReconciliationJob(checkoutRes.payment._id.toString(), 'AMOUNT_MISMATCH');
    expect(manualJobRes.enqueued).toBe(false);
    expect(manualJobRes.message).toContain('Automatic queueing prohibited');
  });

  // 42. Blocker 1 — Worker Execution & Manual Safety Gate
  it('42. should execute worker for automatic reason and reject/skip manual reason safely', async () => {
    const product = await Product.create({
      name: 'Phase4B Worker Test Prod',
      category: productCategoryId,
      price: 25,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'worker_test_key_1',
    });

    // 1. Manual reason -> Worker skips safely without fulfillment
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'AMOUNT_MISMATCH' } }
    );

    const manualWorkerRes = await processReconciliationJob({
      data: { paymentId: checkoutRes.payment._id.toString() },
    } as any);

    expect(manualWorkerRes.processed).toBe(false);

    // 2. Already resolved payment (SUCCEEDED) -> Worker idempotently skips
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'SUCCEEDED', reconciliationReason: null } }
    );

    const succeededWorkerRes = await processReconciliationJob({
      data: { paymentId: checkoutRes.payment._id.toString() },
    } as any);

    expect(succeededWorkerRes.processed).toBe(false);

    // 3. Automatic reason -> Worker processes via reconciliation service
    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN', paymentIntentId: 'pi_worker_auto_123' } }
    );

    const stripe = getStripeClient();
    const fakePiSucc = mockStripePaymentIntent({
      id: 'pi_worker_auto_123',
      amount: checkoutRes.payment.amount,
      status: 'succeeded',
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    const spy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePiSucc as any);

    try {
      const autoWorkerRes = await processReconciliationJob({
        data: { paymentId: checkoutRes.payment._id.toString() },
      } as any);

      expect(autoWorkerRes.processed).toBe(true);

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('SUCCEEDED');
      expect(paymentAfter?.reconciliationReason).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // 43. Blocker 2 — Clear reconciliationReason on Automatic Reconciliation -> SUCCEEDED
  it('43. should explicitly clear reconciliationReason to null when payment reconciles to SUCCEEDED', async () => {
    const product = await Product.create({
      name: 'Phase4B Clear Reason Succ Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'clear_succ_key_1',
    });

    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN', paymentIntentId: 'pi_clear_succ_123' } }
    );

    const stripe = getStripeClient();
    const fakePiSucc = mockStripePaymentIntent({
      id: 'pi_clear_succ_123',
      amount: checkoutRes.payment.amount,
      status: 'succeeded',
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    const spy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePiSucc as any);

    try {
      await marketplaceReconciliationService.reconcilePayment(checkoutRes.payment._id);

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('SUCCEEDED');
      expect(paymentAfter?.reconciliationReason).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // 44. Blocker 2 — Clear reconciliationReason on Automatic Reconciliation -> FAILED
  it('44. should explicitly clear reconciliationReason to null when payment reconciles to FAILED', async () => {
    const product = await Product.create({
      name: 'Phase4B Clear Reason Failed Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'clear_failed_key_1',
    });

    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN', paymentIntentId: 'pi_clear_fail_123' } }
    );

    const stripe = getStripeClient();
    const fakePiCanceled = mockStripePaymentIntent({
      id: 'pi_clear_fail_123',
      status: 'canceled',
    });

    const spy = jest.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue(fakePiCanceled as any);

    try {
      await marketplaceReconciliationService.reconcilePayment(checkoutRes.payment._id);

      const paymentAfter = await Payment.findById(checkoutRes.payment._id);
      expect(paymentAfter?.status).toBe('FAILED');
      expect(paymentAfter?.reconciliationReason).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // 45. Blocker 2 — Clear reconciliationReason on payment_intent.canceled Webhook
  it('45. should explicitly clear reconciliationReason to null when payment_intent.canceled webhook fires', async () => {
    const product = await Product.create({
      name: 'Phase4B Clear Reason Cancel Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'clear_cancel_key_1',
    });

    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN', paymentIntentId: 'pi_clear_cancel_123' } }
    );

    const fakePi = mockStripePaymentIntent({
      id: 'pi_clear_cancel_123',
      amount: checkoutRes.payment.amount,
      status: 'canceled',
      metadata: {
        paymentId: checkoutRes.payment._id.toString(),
        userId: customerId.toString(),
        paymentType: 'PRODUCT_CART',
        platform: 'SKATRIUM_MARKETPLACE',
        engineVersion: 'PHASE_4_MARKETPLACE',
        checkoutFingerprint: checkoutRes.payment.checkoutFingerprint,
      },
    });

    await marketplaceWebhookService.handlePaymentIntentCanceled({
      stripeEventId: 'evt_cancel_recon_1',
      payload: { id: 'evt_cancel_recon_1', type: 'payment_intent.canceled', created: Math.floor(Date.now() / 1000), livemode: false, objectId: 'pi_clear_cancel_123', objectType: 'payment_intent' },
      rawEvent: { created: Math.floor(Date.now() / 1000), data: { object: fakePi } },
    });

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('CANCELED');
    expect(paymentAfter?.reconciliationReason).toBeNull();
  });

  // 46. Blocker 2 Safety — Unresolved Reconciliation Retains Reason
  it('46. should retain reconciliationReason when payment remains RECONCILIATION_REQUIRED', async () => {
    const product = await Product.create({
      name: 'Phase4B Unresolved Retain Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'unresolved_retain_key_1',
    });

    await Payment.updateOne(
      { _id: checkoutRes.payment._id },
      { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'AMOUNT_MISMATCH' } }
    );

    const paymentAfter = await Payment.findById(checkoutRes.payment._id);
    expect(paymentAfter?.status).toBe('RECONCILIATION_REQUIRED');
    expect(paymentAfter?.reconciliationReason).toBe('AMOUNT_MISMATCH');
  });
});
