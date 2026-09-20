import Stripe from 'stripe';
import config from '../config';

let stripeInstance: any = null;

export const getStripeClient = (): any => {
  if (!stripeInstance) {
    const secretKey = config.stripe.stripe_secret_key || 'sk_test_placeholder';
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }
  return stripeInstance;
};

export const setStripeClient = (client: any): void => {
  stripeInstance = client;
};
