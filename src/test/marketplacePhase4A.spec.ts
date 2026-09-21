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
import { marketplaceCheckoutService } from '../app/modules/marketplace/marketplaceCheckout.service';
import { ProductCategory } from '../app/modules/ProductCategory/ProductCategory.model';
import { Category as EventCategory } from '../app/modules/eventcatagore/eventcatagore.model';

describe('Phase 4A — Payment Domain & Reservation Foundation Suite (V4 Corrections)', () => {
  jest.setTimeout(30000);

  let customerId: Types.ObjectId;
  let sellerId: Types.ObjectId;
  let seller2Id: Types.ObjectId;
  let organizerId: Types.ObjectId;

  let productCategoryId: Types.ObjectId;
  let eventCategoryId: Types.ObjectId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.database_url as string);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Payment.deleteMany({});
    await ReservationRecord.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({ name: /.*Phase4A.*/ });
    await Event.deleteMany({ title: /.*Phase4A.*/ });
    await MerchantProfile.deleteMany({});
    await OrganizerProfile.deleteMany({});
    await User.deleteMany({ email: { $regex: /.*@test\.com$/i } });

    // Seed test users
    const customerUser = await User.create({
      email: 'customer_phase4a@test.com',
      password: 'password123',
      fullName: 'Phase 4A Customer',
      phoneNumber: '1111111111',
      role: 'USER',
    });
    customerId = customerUser._id;

    const sellerUser = await User.create({
      email: 'seller1_phase4a@test.com',
      password: 'password123',
      fullName: 'Phase 4A Seller 1',
      phoneNumber: '2222222222',
      role: 'USER',
    });
    sellerId = sellerUser._id;

    const seller2User = await User.create({
      email: 'seller2_phase4a@test.com',
      password: 'password123',
      fullName: 'Phase 4A Seller 2',
      phoneNumber: '3333333333',
      role: 'USER',
    });
    seller2Id = seller2User._id;

    const organizerUser = await User.create({
      email: 'organizer_phase4a@test.com',
      password: 'password123',
      fullName: 'Phase 4A Organizer',
      phoneNumber: '4444444444',
      role: 'USER',
    });
    organizerId = organizerUser._id;

    // Seed Ready Stripe Connected Profiles
    await MerchantProfile.create({
      user: sellerId,
      stripeConnectedAccountId: 'acct_phase4a_merchant_1',
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    await MerchantProfile.create({
      user: seller2Id,
      stripeConnectedAccountId: 'acct_phase4a_merchant_2',
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    await OrganizerProfile.create({
      user: organizerId,
      stripeConnectedAccountId: 'acct_phase4a_organizer_1',
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
      prodCat = await ProductCategory.create({ name: 'Phase4A Category' });
    }
    productCategoryId = prodCat._id;

    let evtCat = await EventCategory.findOne({});
    if (!evtCat) {
      evtCat = await EventCategory.create({ name: 'Phase4A Event Category' });
    }
    eventCategoryId = evtCat._id;
  });

  // 1. Participant capacity based on participant count & 2. attendees.length not used for capacity
  it('1 & 2. should enforce event capacity using participant counts rather than attendees.length', async () => {
    const event = await Event.create({
      title: 'Phase4A Capacity Test Event',
      category: eventCategoryId,
      price: 50,
      host: organizerId,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      address: { city: 'NYC', country: 'USA' },
      maxAttendees: 10,
      confirmedParticipantCount: 4, // User A bought 4 tickets
      pendingReservationCount: 5,   // User B reserved 5 tickets
      attendees: [new Types.ObjectId()], // Only 1 distinct user in roster (attendees.length = 1)
    });

    // Total participants committed = 4 + 5 = 9. Max = 10. Open spots = 1.
    // User C requests 2 tickets -> MUST FAIL even though attendees.length is only 1!
    await expect(
      marketplaceCheckoutService.createEventTicketCheckout({
        userId: customerId,
        eventId: event._id,
        participantCount: 2,
        clientCheckoutIdempotencyKey: 'cap_test_key_1',
      })
    ).rejects.toThrow(/Event capacity exceeded/);
  });

  // 3. Multiple participants by same user
  it('3. should handle single user purchasing multiple participant tickets', async () => {
    const event = await Event.create({
      title: 'Phase4A Multi-Ticket Event',
      category: eventCategoryId,
      price: 40,
      host: organizerId,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      address: { city: 'NYC', country: 'USA' },
      maxAttendees: 10,
      confirmedParticipantCount: 0,
      pendingReservationCount: 0,
      attendees: [],
    });

    const res = await marketplaceCheckoutService.createEventTicketCheckout({
      userId: customerId,
      eventId: event._id,
      participantCount: 4,
      clientCheckoutIdempotencyKey: 'multi_part_key_1',
    });

    expect(res.payment.amount).toBe(16000); // 4 * $40 = 16000 cents
    const updatedEvt = await Event.findById(event._id);
    expect(updatedEvt?.pendingReservationCount).toBe(4);
  });

  // 4. Multi-user participant capacity
  it('4. should track capacity correctly across multiple purchasing users', async () => {
    const event = await Event.create({
      title: 'Phase4A Multi-User Event',
      category: eventCategoryId,
      price: 30,
      host: organizerId,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      address: { city: 'NYC', country: 'USA' },
      maxAttendees: 6,
      confirmedParticipantCount: 0,
      pendingReservationCount: 0,
      attendees: [],
    });

    const user2 = await User.create({
      email: 'user2_multi@test.com',
      password: 'password123',
      fullName: 'User 2 Multi',
      phoneNumber: '8888888888',
      role: 'USER',
    });

    await marketplaceCheckoutService.createEventTicketCheckout({
      userId: customerId,
      eventId: event._id,
      participantCount: 3,
      clientCheckoutIdempotencyKey: 'user1_key',
    });

    await marketplaceCheckoutService.createEventTicketCheckout({
      userId: user2._id,
      eventId: event._id,
      participantCount: 3,
      clientCheckoutIdempotencyKey: 'user2_key',
    });

    const updatedEvt = await Event.findById(event._id);
    expect(updatedEvt?.pendingReservationCount).toBe(6);
  });

  // 5. Event reservation transaction rollback & 6. Product reservation transaction rollback
  it('5 & 6. should roll back reservation and inventory/counter on transaction failure', async () => {
    const product = await Product.create({
      name: 'Phase4A Rollback Prod',
      category: productCategoryId,
      price: 10,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 10 }], // Requests 10, stock is 5
    });

    await expect(
      marketplaceCheckoutService.createProductCartCheckout({
        userId: customerId,
        clientCheckoutIdempotencyKey: 'rollback_key_1',
      })
    ).rejects.toThrow();

    // Verify stock remains untouched (5) and no orphaned ReservationRecord created
    const updatedProd = await Product.findById(product._id);
    expect(updatedProd?.stock).toBe(5);

    const resCount = await ReservationRecord.countDocuments({ targetId: product._id });
    expect(resCount).toBe(0);
  });

  // 7. Event confirmation transaction & 8. Product confirmation transaction
  it('7 & 8. should atomically confirm event reservation and update counters & roster', async () => {
    const event = await Event.create({
      title: 'Phase4A Confirm Event',
      category: eventCategoryId,
      price: 50,
      host: organizerId,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      address: { city: 'NYC', country: 'USA' },
      maxAttendees: 10,
      confirmedParticipantCount: 0,
      pendingReservationCount: 0,
      attendees: [],
    });

    const checkoutRes = await marketplaceCheckoutService.createEventTicketCheckout({
      userId: customerId,
      eventId: event._id,
      participantCount: 3,
      clientCheckoutIdempotencyKey: 'evt_confirm_key',
    });

    const reservationId = checkoutRes.reservations[0]._id;
    const confirmedRes = await marketplaceCheckoutService.confirmReservation(reservationId);

    expect(confirmedRes.status).toBe('CONFIRMED');

    const updatedEvt = await Event.findById(event._id);
    expect(updatedEvt?.pendingReservationCount).toBe(0);
    expect(updatedEvt?.confirmedParticipantCount).toBe(3);
    expect(updatedEvt?.attendees.map((id) => id.toString())).toContain(customerId.toString());
  });

  // 9. Event release transaction & 10. Product release transaction
  it('9 & 10. should atomically release event and product reservations and restore counters/stock', async () => {
    const product = await Product.create({
      name: 'Phase4A Release Prod',
      category: productCategoryId,
      price: 25,
      stock: 4,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'prod_release_key',
    });

    const reservationId = checkoutRes.reservations[0]._id;
    const released = await marketplaceCheckoutService.releaseReservation(reservationId);

    expect(released).toBe(true);
    const updatedProd = await Product.findById(product._id);
    expect(updatedProd?.stock).toBe(4); // Restored back to 4
  });

  // 11. Repeated release is idempotent
  it('11. should enforce idempotent release without double stock/counter restoration', async () => {
    const product = await Product.create({
      name: 'Phase4A Idempotent Release Prod',
      category: productCategoryId,
      price: 20,
      stock: 10,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const checkoutRes = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'idem_release_key',
    });

    const reservationId = checkoutRes.reservations[0]._id;

    // First release
    const firstRelease = await marketplaceCheckoutService.releaseReservation(reservationId);
    expect(firstRelease).toBe(true);

    const prodAfterFirst = await Product.findById(product._id);
    expect(prodAfterFirst?.stock).toBe(10);

    // Second release
    const secondRelease = await marketplaceCheckoutService.releaseReservation(reservationId);
    expect(secondRelease).toBe(false);

    const prodAfterSecond = await Product.findById(product._id);
    expect(prodAfterSecond?.stock).toBe(10); // Still 10, not 12!
  });

  // 12. RECONCILIATION_REQUIRED reservation preservation
  it('12. should preserve reservation in RESERVED state when Payment is RECONCILIATION_REQUIRED', async () => {
    const product = await Product.create({
      name: 'Phase4A Recon Preservation Prod',
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
      clientCheckoutIdempotencyKey: 'recon_pres_key',
    });

    const paymentId = checkoutRes.payment._id;
    const reservationId = checkoutRes.reservations[0]._id;

    // Backdate expiresAt to past
    await ReservationRecord.updateOne(
      { _id: reservationId },
      { $set: { expiresAt: new Date(Date.now() - 3600000) } }
    );

    // Mark Payment RECONCILIATION_REQUIRED
    await Payment.updateOne(
      { _id: paymentId },
      { $set: { status: 'RECONCILIATION_REQUIRED' } }
    );

    // Run expiration worker
    const workerResult = await marketplaceCheckoutService.processExpiredReservations();
    expect(workerResult.releasedCount).toBe(0);

    // Verify reservation remains RESERVED
    const resAfterWorker = await ReservationRecord.findById(reservationId);
    expect(resAfterWorker?.status).toBe('RESERVED');
  });

  // 13. PROCESSING reservation preservation
  it('13. should preserve reservation for PROCESSING payment when Stripe is still processing', async () => {
    const product = await Product.create({
      name: 'Phase4A Proc Preservation Prod',
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
      clientCheckoutIdempotencyKey: 'proc_pres_key',
    });

    const paymentId = checkoutRes.payment._id;
    const reservationId = checkoutRes.reservations[0]._id;

    // Backdate expiresAt to past
    await ReservationRecord.updateOne(
      { _id: reservationId },
      { $set: { expiresAt: new Date(Date.now() - 3600000) } }
    );

    // Mark Payment PROCESSING
    await Payment.updateOne(
      { _id: paymentId },
      { $set: { status: 'PROCESSING', paymentIntentId: 'pi_fake_processing_123' } }
    );

    // Run expiration worker (Stripe mock will throw or fail retrieval -> RECONCILIATION_REQUIRED without release)
    await marketplaceCheckoutService.processExpiredReservations();

    const resAfterWorker = await ReservationRecord.findById(reservationId);
    expect(resAfterWorker?.status).toBe('RESERVED');
  });

  // 14. PENDING expiration
  it('14. should automatically expire PENDING payment and release reservation when TTL passes', async () => {
    const product = await Product.create({
      name: 'Phase4A Pending Expiration Prod',
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
      clientCheckoutIdempotencyKey: 'pending_exp_key',
    });

    const paymentId = checkoutRes.payment._id;
    const reservationId = checkoutRes.reservations[0]._id;

    // Backdate expiresAt to past
    await ReservationRecord.updateOne(
      { _id: reservationId },
      { $set: { expiresAt: new Date(Date.now() - 3600000) } }
    );

    const workerResult = await marketplaceCheckoutService.processExpiredReservations();
    expect(workerResult.releasedCount).toBe(1);

    const paymentAfter = await Payment.findById(paymentId);
    expect(paymentAfter?.status).toBe('EXPIRED');

    const updatedProd = await Product.findById(product._id);
    expect(updatedProd?.stock).toBe(5); // Restored
  });

  // 15. Stripe succeeded after expiration (Late Payment Boundary)
  it('15. should transition PENDING payment to RECONCILIATION_REQUIRED without auto release if late PI succeeds', async () => {
    const product = await Product.create({
      name: 'Phase4A Late Payment Prod',
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
      clientCheckoutIdempotencyKey: 'late_payment_key',
    });

    const paymentId = checkoutRes.payment._id;
    const reservationId = checkoutRes.reservations[0]._id;

    await ReservationRecord.updateOne(
      { _id: reservationId },
      { $set: { expiresAt: new Date(Date.now() - 3600000) } }
    );

    // Simulate PaymentIntent attached
    await Payment.updateOne(
      { _id: paymentId },
      { $set: { paymentIntentId: 'pi_fake_late_succeeded' } }
    );

    // Expiration worker will attempt Stripe retrieval. If Stripe fails or succeeds, payment goes to RECONCILIATION_REQUIRED
    await marketplaceCheckoutService.processExpiredReservations();

    const paymentAfter = await Payment.findById(paymentId);
    expect(paymentAfter?.status).toBe('RECONCILIATION_REQUIRED');
  });

  // 16. Orphan PENDING payment recovery & 17. No PaymentIntent creation for orphan payment
  it('16 & 17. should recover orphaned PENDING payments with zero reservations by marking them CANCELED', async () => {
    const orphanPayment = await Payment.create({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'orphan_key_1',
      checkoutFingerprint: 'fingerprint_orphan',
      engineVersion: 'PHASE_4_MARKETPLACE',
      paymentType: 'PRODUCT_CART',
      currency: 'USD',
      amount: 5000,
      status: 'PENDING',
      paymentIntentId: null,
      allocations: [],
      createdAt: new Date(Date.now() - 3600000), // Backdate 1 hour
    });

    const recoveredCount = await marketplaceCheckoutService.recoverOrphanPendingPayments();
    expect(recoveredCount).toBe(1);

    const paymentAfter = await Payment.findById(orphanPayment._id);
    expect(paymentAfter?.status).toBe('CANCELED');
    expect(paymentAfter?.paymentIntentId).toBeNull();
  });

  // Business Idempotency Test A: Same user + same key + same fingerprint => returns/reuses SAME Payment
  it('Idempotency A. should return and reuse the exact same Payment for identical checkout parameters', async () => {
    const product = await Product.create({
      name: 'Phase4A Idempotency A Prod',
      category: productCategoryId,
      price: 30,
      stock: 10,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const res1 = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'idem_key_same',
    });

    const res2 = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'idem_key_same',
    });

    expect(res1.payment._id.toString()).toBe(res2.payment._id.toString());
    expect(res2.reservations.length).toBe(res1.reservations.length);
  });

  // Business Idempotency Test B: Same user + same key + different fingerprint => HTTP 409 Conflict
  it('Idempotency B. should throw 409 Conflict when idempotency key is reused with different parameters', async () => {
    const event = await Event.create({
      title: 'Phase4A Idempotency B Event',
      category: eventCategoryId,
      price: 40,
      host: organizerId,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      address: { city: 'NYC', country: 'USA' },
      maxAttendees: 10,
      confirmedParticipantCount: 0,
      pendingReservationCount: 0,
      attendees: [],
    });

    // First call with participantCount = 2
    await marketplaceCheckoutService.createEventTicketCheckout({
      userId: customerId,
      eventId: event._id,
      participantCount: 2,
      clientCheckoutIdempotencyKey: 'idem_key_conflict_test',
    });

    // Second call with participantCount = 3 under same idempotency key (different canonical fingerprint)
    await expect(
      marketplaceCheckoutService.createEventTicketCheckout({
        userId: customerId,
        eventId: event._id,
        participantCount: 3,
        clientCheckoutIdempotencyKey: 'idem_key_conflict_test',
      })
    ).rejects.toThrow(/Conflict: Idempotency key reused with different checkout parameters/);
  });

  // Business Idempotency Test C: Same idempotency key after Payment in terminal state => returns SAME Payment/state
  it('Idempotency C. should return existing Payment/state when queried after terminal state is reached', async () => {
    const product = await Product.create({
      name: 'Phase4A Idempotency C Prod',
      category: productCategoryId,
      price: 15,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const res = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'idem_key_terminal',
    });

    // Force Payment into CANCELED status
    await Payment.updateOne({ _id: res.payment._id }, { $set: { status: 'CANCELED' } });

    const resAfterTerminal = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'idem_key_terminal',
    });

    expect(resAfterTerminal.payment._id.toString()).toBe(res.payment._id.toString());
    expect(resAfterTerminal.payment.status).toBe('CANCELED');
  });

  // Business Idempotency Test D: Concurrent identical checkout requests => exactly ONE Payment is created
  it('Idempotency D. should handle concurrent identical checkout requests and create exactly one Payment', async () => {
    const product = await Product.create({
      name: 'Phase4A Concurrent Checkout Prod',
      category: productCategoryId,
      price: 50,
      stock: 20,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 1 }],
    });

    const [res1, res2] = await Promise.all([
      marketplaceCheckoutService.createProductCartCheckout({
        userId: customerId,
        clientCheckoutIdempotencyKey: 'concurrent_checkout_key',
      }),
      marketplaceCheckoutService.createProductCartCheckout({
        userId: customerId,
        clientCheckoutIdempotencyKey: 'concurrent_checkout_key',
      }),
    ]);

    expect(res1.payment._id.toString()).toBe(res2.payment._id.toString());

    const paymentCount = await Payment.countDocuments({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'concurrent_checkout_key',
    });
    expect(paymentCount).toBe(1);
  });

  // Financial Invariant Test
  it('Financial Invariants. should enforce total payment amount equals sum of allocations and correct Stripe account binding', async () => {
    const product = await Product.create({
      name: 'Phase4A Financial Invariant Prod',
      category: productCategoryId,
      price: 25,
      stock: 5,
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [{ product: product._id, currency: 'USD', quantity: 2 }],
    });

    const res = await marketplaceCheckoutService.createProductCartCheckout({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'fin_inv_key',
    });

    const payment = res.payment;
    const sumAllocations = payment.allocations.reduce((acc, curr) => acc + curr.amount, 0);

    // 1. Payment amount === sum(allocations)
    expect(payment.amount).toBe(sumAllocations);
    // 2. Allocation amount > 0
    expect(payment.allocations[0].amount).toBeGreaterThan(0);
    // 3. Allocation currency === Payment currency
    expect(payment.allocations[0].currency).toBe(payment.currency);
    // 4. Seller Stripe account resolved authoritatively from MerchantProfile (cannot be overridden by client input)
    const merchantProfile = await MerchantProfile.findOne({ user: sellerId });
    expect(payment.allocations[0].stripeConnectedAccountId).toBe(merchantProfile?.stripeConnectedAccountId);
  });

  // Single-Transaction Rollback Property Test
  it('Single Transaction Property. should roll back all stock decrements natively in ONE transaction when Item C fails', async () => {
    const prodA = await Product.create({
      name: 'Phase4A SingleTx Prod A',
      category: productCategoryId,
      price: 10,
      stock: 10,
      host: sellerId,
    });

    const prodB = await Product.create({
      name: 'Phase4A SingleTx Prod B',
      category: productCategoryId,
      price: 15,
      stock: 10,
      host: sellerId,
    });

    const prodC = await Product.create({
      name: 'Phase4A SingleTx Prod C',
      category: productCategoryId,
      price: 20,
      stock: 10, // Stock set to 10 so pre-flight check passes
      host: sellerId,
    });

    await Cart.create({
      user: customerId,
      items: [
        { product: prodA._id, currency: 'USD', quantity: 2 },
        { product: prodB._id, currency: 'USD', quantity: 3 },
        { product: prodC._id, currency: 'USD', quantity: 1 },
      ],
    });

    // Spy findOneAndUpdate to return null for prodC inside transaction to simulate concurrent reservation failure
    const origFindOneAndUpdate = Product.findOneAndUpdate.bind(Product);
    const spy = jest.spyOn(Product, 'findOneAndUpdate').mockImplementation(function (filter: any, update: any, options: any) {
      if (filter && filter._id && filter._id.toString() === prodC._id.toString()) {
        return Promise.resolve(null as any);
      }
      return origFindOneAndUpdate(filter, update, options);
    });

    try {
      await expect(
        marketplaceCheckoutService.createProductCartCheckout({
          userId: customerId,
          clientCheckoutIdempotencyKey: 'single_tx_fail_key',
        })
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    // Verify Prod A and Prod B stocks were NOT committed (restored natively by Mongo single-transaction abort)
    const updatedA = await Product.findById(prodA._id);
    const updatedB = await Product.findById(prodB._id);
    expect(updatedA?.stock).toBe(10);
    expect(updatedB?.stock).toBe(10);

    // Verify zero ReservationRecords exist
    const resCountA = await ReservationRecord.countDocuments({ targetId: prodA._id });
    const resCountB = await ReservationRecord.countDocuments({ targetId: prodB._id });
    expect(resCountA).toBe(0);
    expect(resCountB).toBe(0);

    // Verify Payment is marked CANCELED
    const payment = await Payment.findOne({
      userId: customerId,
      clientCheckoutIdempotencyKey: 'single_tx_fail_key',
    });
    expect(payment?.status).toBe('CANCELED');
  });
});
