import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { marketplacePaymentIntentService } from './marketplacePaymentIntent.service';

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

export const MarketplacePaymentController = {
  createPaymentIntent,
  getClientSecret,
};
