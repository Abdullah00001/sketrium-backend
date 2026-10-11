import express from 'express';
import { PaymentController } from './subpayment.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = express.Router();

// Webhook endpoints
router.post('/revenuecat-webhook', PaymentController.revenueCatWebhook);
router.post('/webhook', PaymentController.revenueCatWebhook);

// On-demand sync endpoint
router.post(
  '/sync',
  auth(
    USER_ROLE.admin,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.ORGANIZER,
    USER_ROLE.USER,
  ),
  PaymentController.syncSubscription,
);

// Subscription status
router.get(
  '/revenuecat-my-subscription',
  auth(
    USER_ROLE.admin,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.ORGANIZER,
    USER_ROLE.USER,
  ),
  PaymentController.getRevenueCatSubscription,
);

router.get(
  '/my-subscription',
  auth(
    USER_ROLE.admin,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.ORGANIZER,
    USER_ROLE.USER,
  ),
  PaymentController.getRevenueCatSubscription,
);

export const PaymentRoutes = router;
