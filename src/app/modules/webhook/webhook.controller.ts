import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import { webhookService } from './webhook.service';
import config from '../../config';
import httpStatus from 'http-status';

const handleWixWebhook = catchAsync(async (req: Request, res: Response) => {
  // Validate Webhook Secret (HMAC or simple secret depending on Wix/Stripe setup)
  const webhookSecret = req.headers['x-webhook-secret'] || req.headers['wix-webhook-secret'] || req.headers['stripe-signature'];

  // Check if our environment has the secret configured and it matches the request
  if (config.wix_webhook_secret && webhookSecret !== config.wix_webhook_secret) {
    // If it's stripe, stripe-signature requires complex validation using the raw body, 
    // but the prompt specified a simple secret for now via WIX_WEBHOOK_SECRET
    return res.status(httpStatus.UNAUTHORIZED).json({
      success: false,
      message: 'Unauthorized webhook request. Invalid signature.',
    });
  }

  try {
    await webhookService.handleWixWebhook(req.body);
    
    // Always return 200 promptly to acknowledge receipt
    res.status(httpStatus.OK).json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    // Still return 200 so Wix doesn't retry unnecessarily, but log the error
    // If it's a validation issue, we could return 400
    res.status(httpStatus.OK).json({
      success: false,
      message: 'Webhook received but encountered an error during processing.',
      error: error.message
    });
  }
});

export const webhookController = {
  handleWixWebhook,
};
