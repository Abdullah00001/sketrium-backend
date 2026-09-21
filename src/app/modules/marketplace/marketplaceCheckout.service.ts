import crypto from 'crypto';
import mongoose, { ClientSession, Types } from 'mongoose';
import AppError from '../../error/AppError';
import { Product } from '../product/product.model';
import { Event } from '../event/event.model';
import { Cart } from '../addtocard/addtotocard.model';
import { MerchantProfile } from '../merchantProfile/merchantProfile.model';
import { OrganizerProfile } from '../organizerProfile/organizerProfile.model';
import { Payment } from './marketplacePayment.model';
import { ReservationRecord } from './reservationRecord.model';
import { IPayment, IPaymentAllocation } from './marketplacePayment.interface';
import { IReservationRecord } from './reservationRecord.interface';
import { getStripeClient } from '../../utils/stripeClient';
import { enqueueReconciliationJob } from '../../jobs/marketplaceReconciliation.queue';

export class MarketplaceCheckoutService {
  /**
   * Deterministically generates a canonical SHA-256 fingerprint for checkout parameters.
   */
  public generateCheckoutFingerprint(payload: Record<string, any>): string {
    const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Executes Product Cart Checkout Domain Preparation & Atomic Reservations.
   */
  public async createProductCartCheckout(params: {
    userId: string | Types.ObjectId;
    cartId?: string | Types.ObjectId;
    clientCheckoutIdempotencyKey: string;
    shippingAddress?: any;
  }): Promise<{ payment: IPayment; reservations: IReservationRecord[] }> {
    const { userId, clientCheckoutIdempotencyKey } = params;
    const userObjectId = new Types.ObjectId(userId);

    // 1. Load User Cart with Products
    const cart = await Cart.findOne({ user: userObjectId }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new AppError(400, 'Cart is empty');
    }

    // 2. Build Fingerprint Payload from Authoritative Data
    const canonicalItems = (cart.items as any[])
      .map((item) => ({
        productId: item.product?._id?.toString() || item.product?.toString(),
        quantity: item.quantity,
        color: item.color || '',
        size: item.size || '',
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId));

    const currency = (cart.items[0]?.product as any)?.currency || 'USD';

    const fingerprintPayload = {
      paymentType: 'PRODUCT_CART',
      items: canonicalItems,
      currency,
    };
    const checkoutFingerprint = this.generateCheckoutFingerprint(fingerprintPayload);

    // 3. Business Checkout Idempotency Check
    const existingPayment = await Payment.findOne({
      userId: userObjectId,
      clientCheckoutIdempotencyKey,
    });

    if (existingPayment) {
      if (existingPayment.checkoutFingerprint !== checkoutFingerprint) {
        throw new AppError(
          409,
          'Conflict: Idempotency key reused with different checkout parameters'
        );
      }

      const existingReservations = await ReservationRecord.find({
        paymentId: existingPayment._id,
      });
      return { payment: existingPayment, reservations: existingReservations };
    }

    // 4. Validate Products & Authoritative Price/Seller Resolution
    const sellerItemsMap = new Map<string, { sellerUserId: Types.ObjectId; items: any[] }>();

    for (const item of cart.items as any[]) {
      const product = item.product;
      if (!product || product.isDeleted) {
        throw new AppError(404, `Product not found or unavailable`);
      }

      if (product.stock < item.quantity) {
        throw new AppError(400, `${product.name} has insufficient stock`);
      }

      const hostIdStr = product.host?.toString();
      if (!hostIdStr) {
        throw new AppError(400, `Product ${product.name} has no valid seller/host`);
      }

      if (!sellerItemsMap.has(hostIdStr)) {
        sellerItemsMap.set(hostIdStr, {
          sellerUserId: new Types.ObjectId(hostIdStr),
          items: [],
        });
      }
      sellerItemsMap.get(hostIdStr)!.items.push({ item, product });
    }

    // 5. Seller Stripe Connected Account Resolution & Readiness Assertion
    const allocations: IPaymentAllocation[] = [];
    let totalPaymentAmountCents = 0;
    let allocCounter = 1;

    for (const [hostIdStr, group] of sellerItemsMap.entries()) {
      const merchantProfile = await MerchantProfile.findOne({ user: group.sellerUserId });
      if (
        !merchantProfile ||
        !merchantProfile.stripeConnectedAccountId ||
        merchantProfile.onboardingStatus !== 'READY'
      ) {
        throw new AppError(
          409,
          `Merchant profile for seller ${hostIdStr} is not Stripe-ready`
        );
      }

      let merchantSubtotalCents = 0;
      let merchantShippingCents = 0;

      for (const { item, product } of group.items) {
        const unitPrice = product.discountPrice > 0 ? product.discountPrice : product.price;
        const lineSubtotalCents = Math.round(unitPrice * 100) * item.quantity;
        const lineShippingCents = Math.round((product.shippingCost || 0) * 100);

        merchantSubtotalCents += lineSubtotalCents;
        merchantShippingCents += lineShippingCents;
      }

      const merchantAllocationAmountCents = merchantSubtotalCents + merchantShippingCents;
      if (merchantAllocationAmountCents <= 0) {
        throw new AppError(422, `Calculated seller allocation amount must be positive`);
      }

      allocations.push({
        allocationId: `alloc_${allocCounter++}`,
        sellerUserId: group.sellerUserId,
        sellerRole: 'MARCHANT',
        stripeConnectedAccountId: merchantProfile.stripeConnectedAccountId,
        amount: merchantAllocationAmountCents,
        currency,
        transferStatus: 'PENDING',
        sourceInfo: {
          itemsSubtotal: merchantSubtotalCents,
          shippingFee: merchantShippingCents,
          quantity: group.items.reduce((acc, curr) => acc + curr.item.quantity, 0),
        },
      });

      totalPaymentAmountCents += merchantAllocationAmountCents;
    }

    // Zero-Commission Financial Invariant Assertions
    const sumAllocationsCents = allocations.reduce((acc, curr) => acc + curr.amount, 0);
    if (totalPaymentAmountCents !== sumAllocationsCents) {
      throw new AppError(422, 'Financial Invariant Violation: Payment total != sum(allocations)');
    }

    // 6. Create / Reuse Payment Record in PENDING state
    let payment: IPayment;
    try {
      payment = await Payment.create({
        userId: userObjectId,
        clientCheckoutIdempotencyKey,
        checkoutFingerprint,
        engineVersion: 'PHASE_4_MARKETPLACE',
        paymentType: 'PRODUCT_CART',
        currency,
        amount: totalPaymentAmountCents,
        status: 'PENDING',
        allocations,
        purchasedCartItemIds: (cart.items as any[]).map((i) => i._id),
      });
    } catch (err: any) {
      if (err.code === 11000) {
        const found = await Payment.findOne({
          userId: userObjectId,
          clientCheckoutIdempotencyKey,
        });
        if (found) {
          if (found.checkoutFingerprint !== checkoutFingerprint) {
            throw new AppError(
              409,
              'Conflict: Idempotency key reused with different checkout parameters'
            );
          }
          const existingRes = await ReservationRecord.find({ paymentId: found._id });
          return { payment: found, reservations: existingRes };
        }
      }
      throw err;
    }

    // 7. Atomic Product Stock Reservations with ONE Mongoose Transaction Session
    const acquiredReservations: IReservationRecord[] = [];
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins TTL
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        for (const item of cart.items as any[]) {
          const product = item.product;

          const updatedProduct = await Product.findOneAndUpdate(
            {
              _id: product._id,
              stock: { $gte: item.quantity },
              isDeleted: false,
            },
            { $inc: { stock: -item.quantity } },
            { session, new: true }
          );

          if (!updatedProduct) {
            throw new AppError(409, `Stock reservation failed for product: ${product.name}`);
          }

          const [reservation] = await ReservationRecord.create(
            [
              {
                paymentId: payment._id,
                reservationType: 'PRODUCT',
                targetId: product._id,
                quantity: item.quantity,
                status: 'RESERVED',
                expiresAt,
              },
            ],
            { session }
          );

          acquiredReservations.push(reservation);
        }
      });
    } catch (txErr: any) {
      // Single Transaction Failed -> Abort all and mark Payment CANCELED
      await Payment.updateOne({ _id: payment._id }, { $set: { status: 'CANCELED' } });
      throw new AppError(
        txErr.statusCode || 409,
        txErr.message || 'Product stock reservation failed'
      );
    } finally {
      session.endSession();
    }

    return { payment, reservations: acquiredReservations };
  }

  /**
   * Executes Event Ticket Checkout Domain Preparation & Capacity Reservation.
   */
  public async createEventTicketCheckout(params: {
    userId: string | Types.ObjectId;
    eventId: string | Types.ObjectId;
    participantCount: number;
    clientCheckoutIdempotencyKey: string;
  }): Promise<{ payment: IPayment; reservations: IReservationRecord[] }> {
    const { userId, eventId, participantCount, clientCheckoutIdempotencyKey } = params;
    const userObjectId = new Types.ObjectId(userId);
    const eventObjectId = new Types.ObjectId(eventId);

    if (participantCount < 1 || participantCount > 10) {
      throw new AppError(400, 'Participant count must be between 1 and 10');
    }

    // 1. Load Event & Validate
    const event = await Event.findOne({ _id: eventObjectId, isDeleted: false });
    if (!event) {
      throw new AppError(404, 'Event not found or unavailable');
    }

    if (event.isPast) {
      throw new AppError(400, 'Event has already passed');
    }

    const currency = event.currency || 'USD';
    const fingerprintPayload = {
      paymentType: 'EVENT_TICKET',
      eventId: eventObjectId.toString(),
      participantCount,
      currency,
    };
    const checkoutFingerprint = this.generateCheckoutFingerprint(fingerprintPayload);

    // 2. Business Checkout Idempotency Check
    const existingPayment = await Payment.findOne({
      userId: userObjectId,
      clientCheckoutIdempotencyKey,
    });

    if (existingPayment) {
      if (existingPayment.checkoutFingerprint !== checkoutFingerprint) {
        throw new AppError(
          409,
          'Conflict: Idempotency key reused with different checkout parameters'
        );
      }

      if (existingPayment.status === 'PENDING') {
        const existingReservations = await ReservationRecord.find({
          paymentId: existingPayment._id,
        });
        return { payment: existingPayment, reservations: existingReservations };
      }
    }

    // 3. Organizer Stripe Account Resolution & Readiness Assertion
    const organizerProfile = await OrganizerProfile.findOne({ user: event.host });
    if (
      !organizerProfile ||
      !organizerProfile.stripeConnectedAccountId ||
      organizerProfile.onboardingStatus !== 'READY'
    ) {
      throw new AppError(
        409,
        `Organizer profile for event host ${event.host} is not Stripe-ready`
      );
    }

    // 4. Calculate Financial Allocation & Assert Invariants
    const ticketPriceCents = Math.round((event.price || 0) * 100);
    const totalAmountCents = ticketPriceCents * participantCount;

    if (totalAmountCents <= 0) {
      throw new AppError(422, 'Total event ticket price must be greater than zero');
    }

    const allocations: IPaymentAllocation[] = [
      {
        allocationId: 'alloc_1',
        sellerUserId: event.host,
        sellerRole: 'ORGANIZER',
        stripeConnectedAccountId: organizerProfile.stripeConnectedAccountId,
        amount: totalAmountCents,
        currency,
        transferStatus: 'PENDING',
        sourceInfo: {
          eventId: event._id,
          quantity: participantCount,
        },
      },
    ];

    // 5. Create Payment Record in PENDING state
    let payment: IPayment;
    try {
      payment = await Payment.create({
        userId: userObjectId,
        clientCheckoutIdempotencyKey,
        checkoutFingerprint,
        engineVersion: 'PHASE_4_MARKETPLACE',
        paymentType: 'EVENT_TICKET',
        currency,
        amount: totalAmountCents,
        status: 'PENDING',
        allocations,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        const found = await Payment.findOne({
          userId: userObjectId,
          clientCheckoutIdempotencyKey,
        });
        if (found) {
          if (found.checkoutFingerprint !== checkoutFingerprint) {
            throw new AppError(
              409,
              'Conflict: Idempotency key reused with different checkout parameters'
            );
          }
          const existingRes = await ReservationRecord.find({ paymentId: found._id });
          return { payment: found, reservations: existingRes };
        }
      }
      throw err;
    }

    // 6. Atomic Event Capacity Reservation via Transaction Session
    let reservation: IReservationRecord;
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const updatedEvent = await Event.findOneAndUpdate(
          {
            _id: eventObjectId,
            isDeleted: false,
            isPast: false,
            $expr: {
              $or: [
                { $eq: [{ $ifNull: ['$maxAttendees', null] }, null] },
                {
                  $gte: [
                    {
                      $subtract: [
                        '$maxAttendees',
                        {
                          $add: [
                            { $ifNull: ['$confirmedParticipantCount', 0] },
                            { $ifNull: ['$pendingReservationCount', 0] },
                          ],
                        },
                      ],
                    },
                    participantCount,
                  ],
                },
              ],
            },
          },
          { $inc: { pendingReservationCount: participantCount } },
          { session, new: true }
        );

        if (!updatedEvent) {
          throw new AppError(409, 'Event capacity exceeded or event unavailable');
        }

        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins TTL
        const [createdRes] = await ReservationRecord.create(
          [
            {
              paymentId: payment._id,
              reservationType: 'EVENT',
              targetId: event._id,
              quantity: participantCount,
              status: 'RESERVED',
              expiresAt,
            },
          ],
          { session }
        );

        reservation = createdRes;
      });
    } catch (txErr: any) {
      // Transaction failed -> Mark Payment CANCELED
      await Payment.updateOne({ _id: payment._id }, { $set: { status: 'CANCELED' } });
      throw new AppError(
        txErr.statusCode || 409,
        txErr.message || 'Event capacity reservation failed'
      );
    } finally {
      session.endSession();
    }

    return { payment, reservations: [reservation!] };
  }

  /**
   * Single Authoritative Atomic Confirmation Service.
   * Atomic transition RESERVED -> CONFIRMED + Counter/Roster mutation.
   */
  public async confirmReservation(
    reservationId: string | Types.ObjectId,
    externalSession?: ClientSession
  ): Promise<IReservationRecord> {
    const runInSession = async (session: ClientSession): Promise<IReservationRecord> => {
      const updatedRes = await ReservationRecord.findOneAndUpdate(
        { _id: reservationId, status: 'RESERVED' },
        { $set: { status: 'CONFIRMED', confirmedAt: new Date() } },
        { session, new: true }
      );

      if (!updatedRes) {
        const existing = await ReservationRecord.findById(reservationId).session(session);
        if (!existing) {
          throw new AppError(404, 'Reservation record not found');
        }
        throw new AppError(
          400,
          `Forbidden reservation state transition from ${existing.status} to CONFIRMED`
        );
      }

      if (updatedRes.reservationType === 'EVENT') {
        const payment = await Payment.findById(updatedRes.paymentId).session(session);
        await Event.updateOne(
          { _id: updatedRes.targetId },
          {
            $inc: {
              pendingReservationCount: -updatedRes.quantity,
              confirmedParticipantCount: updatedRes.quantity,
            },
            ...(payment?.userId && { $addToSet: { attendees: payment.userId } }),
          },
          { session }
        );
      }

      return updatedRes;
    };

    if (externalSession) {
      return runInSession(externalSession);
    }

    const session = await mongoose.startSession();
    try {
      let result: IReservationRecord;
      await session.withTransaction(async () => {
        result = await runInSession(session);
      });
      return result!;
    } finally {
      session.endSession();
    }
  }

  /**
   * Single Authoritative Atomic Release Service.
   * Atomic transition RESERVED -> RELEASED + Stock/Counter restoration.
   */
  public async releaseReservation(
    reservationId: string | Types.ObjectId,
    externalSession?: ClientSession
  ): Promise<boolean> {
    const runInSession = async (session: ClientSession): Promise<boolean> => {
      const updatedRes = await ReservationRecord.findOneAndUpdate(
        { _id: reservationId, status: 'RESERVED' },
        { $set: { status: 'RELEASED', releasedAt: new Date() } },
        { session, new: true }
      );

      if (!updatedRes) {
        // Reservation was already RELEASED or CONFIRMED; do nothing idempotently.
        return false;
      }

      if (updatedRes.reservationType === 'PRODUCT') {
        await Product.updateOne(
          { _id: updatedRes.targetId },
          { $inc: { stock: updatedRes.quantity } },
          { session }
        );
      } else if (updatedRes.reservationType === 'EVENT') {
        await Event.updateOne(
          { _id: updatedRes.targetId },
          { $inc: { pendingReservationCount: -updatedRes.quantity } },
          { session }
        );
      }

      return true;
    };

    if (externalSession) {
      return runInSession(externalSession);
    }

    const session = await mongoose.startSession();
    try {
      let result = false;
      await session.withTransaction(async () => {
        result = await runInSession(session);
      });
      return result;
    } finally {
      session.endSession();
    }
  }

  /**
   * Compensating Release for partial checkout failure.
   * Releases all acquired reservations for a payment and marks Payment CANCELED.
   */
  public async compensatePartialReservations(
    acquiredReservations: IReservationRecord[],
    paymentId: Types.ObjectId
  ): Promise<void> {
    let compensationFailed = false;

    for (const res of acquiredReservations) {
      try {
        await this.releaseReservation(res._id);
      } catch (err) {
        compensationFailed = true;
      }
    }

    await Payment.updateOne(
      { _id: paymentId },
      { $set: { status: compensationFailed ? 'RECONCILIATION_REQUIRED' : 'CANCELED' } }
    );

    if (compensationFailed) {
      throw new AppError(
        500,
        `Compensation error during partial failure release for payment ${paymentId}`
      );
    }
  }

  /**
   * Expiration & Recovery Worker: Sweeps expired reservations evaluating parent Payment state matrix.
   */
  public async processExpiredReservations(): Promise<{ processedCount: number; releasedCount: number }> {
    const now = new Date();
    const candidateReservations = await ReservationRecord.find({
      status: 'RESERVED',
      expiresAt: { $lt: now },
    });

    let processedCount = 0;
    let releasedCount = 0;

    for (const res of candidateReservations) {
      processedCount++;
      const payment = await Payment.findById(res.paymentId);
      if (!payment) continue;

      // Rule: DO NOT automatically release RECONCILIATION_REQUIRED
      if (payment.status === 'RECONCILIATION_REQUIRED') {
        continue;
      }

      // Rule: Automatic release for terminal failure states FAILED, CANCELED, EXPIRED
      if (['FAILED', 'CANCELED', 'EXPIRED'].includes(payment.status)) {
        const released = await this.releaseReservation(res._id);
        if (released) releasedCount++;
        continue;
      }

      // Rule: PROCESSING & PENDING payments -> Reconcile against Stripe SDK before taking action
      if (['PENDING', 'PROCESSING'].includes(payment.status)) {
        // Check 7-day Max Processing Duration Policy
        const isMaxProcessingExceeded =
          payment.status === 'PROCESSING' &&
          now.getTime() - payment.createdAt.getTime() > 7 * 24 * 60 * 60 * 1000;

        if (payment.paymentIntentId) {
          try {
            const stripe = getStripeClient();
            const pi = await stripe.paymentIntents.retrieve(payment.paymentIntentId);

            if (pi.status === 'succeeded') {
              if (payment.status === 'PROCESSING') {
                await Payment.updateOne(
                  { _id: payment._id },
                  { $set: { status: 'SUCCEEDED', succeededAt: new Date(), reconciliationReason: null } }
                );
                await this.confirmReservation(res._id);
              } else {
                // PENDING + expired TTL + Stripe succeeded -> Late Payment Boundary
                await Payment.updateOne(
                  { _id: payment._id },
                  { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'RESERVATION_ALREADY_RELEASED' } }
                );
              }
            } else if (
              ['canceled', 'requires_payment_method'].includes(pi.status)
            ) {
              const targetStatus = payment.status === 'PROCESSING' ? 'FAILED' : 'EXPIRED';
              await Payment.updateOne(
                { _id: payment._id },
                { $set: { status: targetStatus, reconciliationReason: null } }
              );
              const released = await this.releaseReservation(res._id);
              if (released) releasedCount++;
            } else if (pi.status === 'processing') {
              if (isMaxProcessingExceeded) {
                // Known Stripe processing state after 7 days -> PROCESSING_MAX_DURATION_EXCEEDED
                await Payment.updateOne(
                  { _id: payment._id },
                  { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'PROCESSING_MAX_DURATION_EXCEEDED' } }
                );
              }
              continue;
            } else {
              // Unresolved -> RECONCILIATION_REQUIRED
              await Payment.updateOne(
                { _id: payment._id },
                { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'UNKNOWN' } }
              );
            }
          } catch (stripeErr: any) {
            // Stripe API or network error -> DO NOT mark FAILED or release inventory blindly!
            await Payment.updateOne(
              { _id: payment._id },
              { $set: { status: 'RECONCILIATION_REQUIRED', reconciliationReason: 'STRIPE_API_UNCERTAIN' } }
            );
            await enqueueReconciliationJob(payment._id.toString(), 'STRIPE_API_UNCERTAIN');
          }
        } else {
          // PENDING payment with no paymentIntentId + expired TTL -> Safe to expire & release
          await Payment.updateOne({ _id: payment._id }, { $set: { status: 'EXPIRED' } });
          const released = await this.releaseReservation(res._id);
          if (released) releasedCount++;
        }
      }
    }

    return { processedCount, releasedCount };
  }

  /**
   * Orphan Pending Payment Recovery Worker: Recovers PENDING payments with no PI and 0 reservations.
   */
  public async recoverOrphanPendingPayments(): Promise<number> {
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 mins
    const orphanPayments = await Payment.find({
      status: 'PENDING',
      paymentIntentId: null,
      createdAt: { $lt: cutoffTime },
    });

    let canceledCount = 0;
    for (const payment of orphanPayments) {
      const reservationCount = await ReservationRecord.countDocuments({ paymentId: payment._id });
      if (reservationCount === 0) {
        await Payment.updateOne({ _id: payment._id }, { $set: { status: 'CANCELED' } });
        canceledCount++;
      }
    }

    return canceledCount;
  }
}

export const marketplaceCheckoutService = new MarketplaceCheckoutService();
