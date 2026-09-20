import express from 'express';
import { stripeWebhookController } from './stripeWebhook.controller';

const router = express.Router();

/**
 * Stripe Webhook Endpoint: POST /api/v1/payments/stripe/webhook
 * 
 * Uses express.raw({ type: 'application/json' }) to ensure raw Buffer bytes
 * are passed to Stripe signature verification without modification by JSON parsers.
 */
router.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookController.handleStripeWebhook
);

export const paymentRoutes = router;
