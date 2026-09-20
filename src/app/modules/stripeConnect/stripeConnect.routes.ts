import { Router } from 'express';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';
import { StripeConnectController } from './stripeConnect.controller';

const router = Router();

// Merchant Endpoints
router.post(
  '/merchant/onboard',
  auth(
    USER_ROLE.USER,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
  ),
  StripeConnectController.onboardMerchant,
);

router.get(
  '/merchant/status',
  auth(
    USER_ROLE.USER,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
  ),
  StripeConnectController.getMerchantStatus,
);

// Organizer Endpoints
router.post(
  '/organizer/onboard',
  auth(
    USER_ROLE.USER,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
  ),
  StripeConnectController.onboardOrganizer,
);

router.get(
  '/organizer/status',
  auth(
    USER_ROLE.USER,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
  ),
  StripeConnectController.getOrganizerStatus,
);

// Secure Single-Use Token Return / Refresh Endpoints (Browser/Redirect Handling)
router.get('/return', StripeConnectController.handleReturn);
router.get('/refresh', StripeConnectController.handleRefresh);

export const StripeConnectRoutes = router;
