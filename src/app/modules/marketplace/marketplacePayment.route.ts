import { Router } from 'express';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';
import { MarketplacePaymentController } from './marketplacePayment.controller';

const router = Router();

router.post(
  '/:paymentId/create-intent',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  MarketplacePaymentController.createPaymentIntent
);

router.get(
  '/:paymentId/client-secret',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  MarketplacePaymentController.getClientSecret
);

export const MarketplacePaymentRoutes = router;
