import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../error/AppError';
import { marketplacePaymentIntentService } from './marketplacePaymentIntent.service';
import { marketplaceCheckoutService } from './marketplaceCheckout.service';
import { Payment } from './marketplacePayment.model';

export const createProductCartCheckout = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const clientCheckoutIdempotencyKey =
    req.body.clientCheckoutIdempotencyKey || (req.headers['x-idempotency-key'] as string);
  const shippingAddress = req.body.shippingAddress;

  const result = await marketplaceCheckoutService.createProductCartCheckout({
    userId,
    clientCheckoutIdempotencyKey,
    shippingAddress,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Product cart checkout created successfully',
    data: result,
  });
});

export const createEventTicketCheckout = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const { eventId, participantCount, clientCheckoutIdempotencyKey } = req.body;

  const result = await marketplaceCheckoutService.createEventTicketCheckout({
    userId,
    eventId,
    participantCount,
    clientCheckoutIdempotencyKey:
      clientCheckoutIdempotencyKey || (req.headers['x-idempotency-key'] as string),
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Event ticket checkout created successfully',
    data: result,
  });
});

export const createPaymentIntent = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const paymentId = req.params.paymentId as string;

  const result = await marketplacePaymentIntentService.createPaymentIntent({
    paymentId,
    userId,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stripe PaymentIntent created successfully',
    data: result,
  });
});

export const getClientSecret = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const paymentId = req.params.paymentId as string;

  const clientSecret = await marketplacePaymentIntentService.getClientSecret(paymentId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Client secret retrieved successfully',
    data: { clientSecret },
  });
});

export const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const paymentId = req.params.paymentId as string;

  const payment = await Payment.findOne({ _id: paymentId, userId });
  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found');
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment status retrieved successfully',
    data: {
      paymentId: payment._id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      paymentType: payment.paymentType,
      reconciliationReason: payment.reconciliationReason,
      createdAt: payment.createdAt,
      succeededAt: payment.succeededAt,
    },
  });
});

export const MarketplacePaymentController = {
  createProductCartCheckout,
  createEventTicketCheckout,
  createPaymentIntent,
  getClientSecret,
  getPaymentStatus,
};

