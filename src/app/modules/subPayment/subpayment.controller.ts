import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PaymentService } from './subpayment.service';

// ─── RevenueCat Webhook ───────────────────────────────────────────────────────────
const revenueCatWebhook = async (req: Request, res: Response) => {
  try {
    // Add any authorization checks if RevenueCat webhook is protected
    
    await PaymentService.handleRevenueCatWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};

const getRevenueCatSubscription = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id;
  const result = await PaymentService.getRevenueCatSubscription(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'RevenueCat subscription details fetched successfully',
    data: result,
  });
});

export const PaymentController = {
  revenueCatWebhook,
  getRevenueCatSubscription,
};