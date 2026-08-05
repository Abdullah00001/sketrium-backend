import { Router } from 'express';

import auth from '../../middleware/auth.middleware';
import { PromoCodeController } from './promocode.controller';
import { USER_ROLE } from '../user/user.constant';

const router = Router();

// ─── Admin Only ───────────────────────────────────────────────────────────────
router.post(
  '/generate',
  auth(USER_ROLE.USER),
  PromoCodeController.generatePromoCode,
);
router.get('/', auth(USER_ROLE.admin), PromoCodeController.getAllPromoCodes);
router.delete(
  '/:id',
  auth(USER_ROLE.admin),
  PromoCodeController.deletePromoCode,
);

// ─── User ─────────────────────────────────────────────────────────────────────
router.post(
  '/validate',
  auth(USER_ROLE.USER, USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER),
  PromoCodeController.validatePromoCode,
);

export const PromoCodeRoutes = router;
