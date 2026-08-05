import { Router } from 'express';
import auth from '../../middleware/auth.middleware';
import { WithdrawalController } from './withdrawal.controller';
import { USER_ROLE } from '../user/user.constant';

const router = Router();


// ✅ Specific routes আগে রাখো
router.post(
  '/onboarding',
  auth(USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER),
  WithdrawalController.createOnboardingLink,
)

router.get(
  '/onboarding/status',
  auth(USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER),
  WithdrawalController.checkOnboardingStatus,
)

router.post(
  '/request',
  auth(USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER),
  WithdrawalController.requestWithdrawal,
)

router.get(
  '/history',
  auth(USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER),
  WithdrawalController.getWithdrawalHistory,
)

// ✅ Dynamic route সবার শেষে রাখো
router.get(
  '/:withdrawalId',
  auth(USER_ROLE.MARCHANT, USER_ROLE.ORGANIZER, USER_ROLE.admin),
  WithdrawalController.getWithdrawalStatus,
)

router.post(
  '/:withdrawalId/approve',
  auth(USER_ROLE.admin),
  WithdrawalController.approveWithdrawal,
)

router.post(
  '/:withdrawalId/reject',
  auth(USER_ROLE.admin),
  WithdrawalController.rejectWithdrawal,
)


export const WithdrawalRoutes = router;