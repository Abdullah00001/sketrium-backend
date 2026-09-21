import expect from 'expect';
import mongoose, { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import app from '../app';
import config from '../app/config';
import User from '../app/modules/user/user.model';
import { MerchantProfile } from '../app/modules/merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../app/modules/organizerProfile/organizerProfile.model';
import { Product } from '../app/modules/product/product.model';
import { Event } from '../app/modules/event/event.model';
import { Cart } from '../app/modules/addtocard/addtotocard.model';
import { Payment } from '../app/modules/marketplace/marketplacePayment.model';
import { ReservationRecord } from '../app/modules/marketplace/reservationRecord.model';
import { ProductCategory } from '../app/modules/ProductCategory/ProductCategory.model';
import { Category as EventCategory } from '../app/modules/eventcatagore/eventcatagore.model';

describe('Phase 5B.1 — Marketplace Checkout HTTP Routes Integration Suite', () => {
  jest.setTimeout(30000);

  let customerId: Types.ObjectId;
  let customerToken: string;
  let seller1Id: Types.ObjectId;
  let seller2Id: Types.ObjectId;
  let organizerId: Types.ObjectId;

  let product1Id: Types.ObjectId;
  let product2Id: Types.ObjectId;
  let eventId: Types.ObjectId;
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
    await Product.deleteMany({ name: /.*CheckoutRoutes.*/ });
    await Event.deleteMany({ title: /.*CheckoutRoutes.*/ });
    await MerchantProfile.deleteMany({});
    await OrganizerProfile.deleteMany({});
    await User.deleteMany({ email: /.*checkout_routes.*@test\.com$/i });

    // Seed test customer
    const customerUser = await User.create({
      email: 'customer_checkout_routes@test.com',
      password: 'password123',
      fullName: 'Route Test Customer',
      phoneNumber: '1111111111',
      role: 'USER',
    });
    customerId = customerUser._id;

    customerToken = jwt.sign(
      { id: customerId.toString(), role: 'USER' },
      config.jwt.jwt_access_secret as string,
      { expiresIn: '1h' }
    );

    // Seed seller 1
    const seller1User = await User.create({
      email: 'seller1_checkout_routes@test.com',
      password: 'password123',
      fullName: 'Route Test Seller 1',
      phoneNumber: '2222222222',
      role: 'USER',
    });
    seller1Id = seller1User._id;

    await MerchantProfile.create({
      user: seller1Id,
      stripeConnectedAccountId: 'acct_route_merchant_1',
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    // Seed seller 2 for multi-merchant tests
    const seller2User = await User.create({
      email: 'seller2_checkout_routes@test.com',
      password: 'password123',
      fullName: 'Route Test Seller 2',
      phoneNumber: '3333333333',
      role: 'USER',
    });
    seller2Id = seller2User._id;

    await MerchantProfile.create({
      user: seller2Id,
      stripeConnectedAccountId: 'acct_route_merchant_2',
      accountCreationStatus: 'CREATED',
      onboardingStatus: 'READY',
      detailsSubmitted: true,
      payoutsEnabled: true,
      transfersCapability: 'active',
      creationAttemptCount: 1,
    });

    // Seed organizer
    const organizerUser = await User.create({
      email: 'organizer_checkout_routes@test.com',
      password: 'password123',
      fullName: 'Route Test Organizer',
      phoneNumber: '4444444444',
      role: 'USER',
    });
    organizerId = organizerUser._id;

    await OrganizerProfile.create({
      user: organizerId,
      stripeConnectedAccountId: 'acct_route_organizer_1',
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
      prodCat = await ProductCategory.create({ name: 'CheckoutRoutes Product Category' });
    }
    productCategoryId = prodCat._id;

    let evtCat = await EventCategory.findOne({});
    if (!evtCat) {
      evtCat = await EventCategory.create({ name: 'CheckoutRoutes Event Category' });
    }
    eventCategoryId = evtCat._id;

    // Seed products
    const prod1 = await Product.create({
      name: 'CheckoutRoutes Product 1',
      category: productCategoryId,
      price: 50,
      discountPrice: 40,
      shippingCost: 5,
      stock: 10,
      host: seller1Id,
      currency: 'USD',
      description: 'Test product 1',
    });
    product1Id = prod1._id;

    const prod2 = await Product.create({
      name: 'CheckoutRoutes Product 2',
      category: productCategoryId,
      price: 30,
      discountPrice: 20,
      shippingCost: 3,
      stock: 5,
      host: seller2Id,
      currency: 'USD',
      description: 'Test product 2',
    });
    product2Id = prod2._id;

    // Seed event
    const ev = await Event.create({
      title: 'CheckoutRoutes Event 1',
      category: eventCategoryId,
      price: 50,
      host: organizerId,
      currency: 'USD',
      maxAttendees: 5,
      confirmedParticipantCount: 0,
      pendingReservationCount: 0,
      isDeleted: false,
      isPast: false,
      date: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
    });
    eventId = ev._id;
  });

  it('1. Product checkout creates Payment via HTTP POST /api/v1/marketplace/payments/checkout/cart', async () => {
    // Add product 1 to cart
    await Cart.create({
      user: customerId,
      items: [{ product: product1Id, quantity: 2, currency: 'USD' }],
    });

    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_route_test_1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payment._id).toBeDefined();
    expect(res.body.data.payment.amount).toBe(8500); // (40 * 2 + 5) * 100
    expect(res.body.data.payment.status).toBe('PENDING');
  });

  it('2. Event checkout creates Payment via HTTP POST /api/v1/marketplace/payments/checkout/event', async () => {
    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/event')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId: eventId.toString(),
        participantCount: 2,
        clientCheckoutIdempotencyKey: 'chk_event_route_test_1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payment._id).toBeDefined();
    expect(res.body.data.payment.amount).toBe(10000); // 50 * 2 * 100
    expect(res.body.data.payment.status).toBe('PENDING');
  });

  it('3. Product checkout reserves stock', async () => {
    await Cart.create({
      user: customerId,
      items: [{ product: product1Id, quantity: 3, currency: 'USD' }],
    });

    await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_route_stock_1',
      });

    const updatedProduct = await Product.findById(product1Id);
    expect(updatedProduct?.stock).toBe(7); // 10 - 3

    const reservations = await ReservationRecord.find({ targetId: product1Id });
    expect(reservations.length).toBe(1);
    expect(reservations[0].quantity).toBe(3);
    expect(reservations[0].status).toBe('RESERVED');
  });

  it('4. Event checkout reserves capacity', async () => {
    await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/event')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId: eventId.toString(),
        participantCount: 3,
        clientCheckoutIdempotencyKey: 'chk_event_cap_1',
      });

    const updatedEvent = await Event.findById(eventId);
    expect(updatedEvent?.pendingReservationCount).toBe(3);

    const reservations = await ReservationRecord.find({ targetId: eventId });
    expect(reservations.length).toBe(1);
    expect(reservations[0].quantity).toBe(3);
    expect(reservations[0].status).toBe('RESERVED');
  });

  it('5. Multi-merchant product cart works', async () => {
    await Cart.create({
      user: customerId,
      items: [
        { product: product1Id, quantity: 2, currency: 'USD' },
        { product: product2Id, quantity: 1, currency: 'USD' },
      ],
    });

    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_multi_merchant_1',
      });

    expect(res.status).toBe(201);
    const payment = await Payment.findById(res.body.data.payment._id);
    expect(payment?.allocations.length).toBe(2);
    expect(payment?.amount).toBe(10800); // (40*2+5) + (20*1+3) = 85 + 23 = 108 USD = 10800 cents
  });

  it('6. Invalid stock is rejected with 400 Bad Request', async () => {
    await Cart.create({
      user: customerId,
      items: [{ product: product1Id, quantity: 20, currency: 'USD' }], // Stock is 10
    });

    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_overstock_1',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('7. Insufficient event capacity is rejected with 409 Conflict', async () => {
    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/event')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        eventId: eventId.toString(),
        participantCount: 10, // Max attendees is 5
        clientCheckoutIdempotencyKey: 'chk_overcap_1',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('8. Unauthorized requests are rejected with 401 Unauthorized', async () => {
    const res = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .send({
        clientCheckoutIdempotencyKey: 'chk_unauth_1',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('9. Checkout response contains valid paymentId for create-intent', async () => {
    await Cart.create({
      user: customerId,
      items: [{ product: product1Id, quantity: 1, currency: 'USD' }],
    });

    const checkoutRes = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_valid_pid_1',
      });

    const paymentId = checkoutRes.body.data.payment._id;
    expect(paymentId).toBeDefined();

    const intentRes = await supertest(app)
      .post(`/api/v1/marketplace/payments/${paymentId}/create-intent`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});

    expect(intentRes.status).toBe(200);
    expect(intentRes.body.data.clientSecret).toBeDefined();
    expect(intentRes.body.data.paymentIntentId).toBeDefined();
  });

  it('10. Existing Phase 4A/4B/4C behavior remains unchanged', async () => {
    await Cart.create({
      user: customerId,
      items: [{ product: product1Id, quantity: 1, currency: 'USD' }],
    });

    const checkoutRes = await supertest(app)
      .post('/api/v1/marketplace/payments/checkout/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        clientCheckoutIdempotencyKey: 'chk_phase_intact_1',
      });

    const paymentId = checkoutRes.body.data.payment._id;

    const statusRes = await supertest(app)
      .get(`/api/v1/marketplace/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('PENDING');
  });
});
