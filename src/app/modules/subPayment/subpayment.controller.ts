import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PaymentService } from './subpayment.service';

// ─── RevenueCat Webhook ───────────────────────────────────────────────────────────
const revenueCatWebhook = async (req: Request, res: Response) => {
  try {
    const result = await PaymentService.handleRevenueCatWebhook(
      req.body,
      req.headers.authorization,
    );
    res.status(200).json(result || { received: true });
  } catch (err: any) {
    res
      .status(err.statusCode || 400)
      .json({ error: err.message || 'Webhook processing failed' });
  }
};

const getRevenueCatSubscription = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user._id || req.user.id;
    const result = await PaymentService.getRevenueCatSubscription(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'RevenueCat subscription details fetched successfully',
      data: result,
    });
  },
);

const syncSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id || req.user.id;
  const result = await PaymentService.syncUserRevenueCatEntitlements(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscription synced successfully with RevenueCat',
    data: result,
  });
});

export const PaymentController = {
  revenueCatWebhook,
  getRevenueCatSubscription,
  syncSubscription,
};