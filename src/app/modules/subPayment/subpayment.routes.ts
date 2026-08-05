import express from 'express';
import { PaymentController } from './subpayment.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = express.Router();

router.post(
  '/revenuecat-webhook',
  PaymentController.revenueCatWebhook,
);

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

export const PaymentRoutes = router;
