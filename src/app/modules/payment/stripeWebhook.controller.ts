import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import httpStatus from 'http-status';
import { stripeWebhookService } from './stripeWebhook.service';

/**
 * Controller for handling incoming Stripe Webhook POST requests.
 * Safely extracts raw Buffer from req.rawBody or req.body.
 */
export const handleStripeWebhook = catchAsync(async (req: Request, res: Response) => {
  const signatureHeader = req.headers['stripe-signature'] as string;
  
  // Extract raw body bytes (prefer req.rawBody captured by express.json verify hook or req.body Buffer)
  const rawBody: Buffer = (req as any).rawBody || 
    (Buffer.isBuffer(req.body) 
      ? req.body 
      : (typeof req.body === 'string' ? Buffer.from(req.body) : req.body));

  const result = await stripeWebhookService.handleWebhookRequest(rawBody, signatureHeader);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stripe webhook event processed successfully',
    data: result,
  });
});

export const stripeWebhookController = {
  handleStripeWebhook,
};
