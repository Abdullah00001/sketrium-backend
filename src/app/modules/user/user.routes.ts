import { Router } from 'express';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from './user.constant';
import { userControllers } from './user.controller';
import validateRequest from '../../middleware/validateRequest';
import { authValidation } from '../auth/auth.validation';
import upload from '../../middleware/fileUpload';
import { accountSwitchValidation } from './user.validation';

const router = Router();

router.get(
  '/getby-roll',
  auth(
    USER_ROLE.USER,
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.admin,
  ),
  userControllers.getUsersByRole,
);

router.get(
  '/organizer-profile/:userId',
  auth(
    USER_ROLE.USER,
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.KAATEDJ,
    USER_ROLE.admin,
  ),
  userControllers.getOrganizerProfile,
);

// GET /api/v1/users/:userId/marchant-profile
router.get(
  '/marchant-profile/:userId',
  auth(
    USER_ROLE.USER,
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.KAATEDJ,
    USER_ROLE.admin,
  ),
  userControllers.getMarchantProfile,
);

// GET /api/v1/subscribe-email
router.get(
  '/subscribe-email',
  auth(USER_ROLE.admin),
  userControllers.getAllSubscribers,
);

router.get('/me', auth(USER_ROLE.USER, USER_ROLE.USER), userControllers.getme);

// For login user (user & admin both)
router.patch(
  '/update-profile',
  auth(USER_ROLE.USER, USER_ROLE.USER),
  upload.single('image'),
  userControllers.updateProfile,
);
// //toatal user count
router.get(
  '/total-count',
  auth(USER_ROLE.USER, USER_ROLE.USER),
  userControllers.getTotalUsersCount,
);
router.get(
  '/monthly-user-stats',
  auth(USER_ROLE.admin),
  userControllers.getMonthlyUserStats,
);
router.get(
  '/user-growth-overview',
  auth(USER_ROLE.admin),
  userControllers.getUserGrowthOverview,
);

// For admin to update others
// router.patch(
//   '/:id',
//   auth(USER_ROLE.admin, USER_ROLE.sup_admin),
// //   upload.single('file'),
//   userControllers.updateProfile,
// );

router.patch(
  '/phone/update',
  auth(
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
    USER_ROLE.admin,
  ),
  userControllers.updatePhoneNumber,
);
router.patch(
  '/account-switch',
  auth(
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
    USER_ROLE.MARCHANT,
    USER_ROLE.ORGANIZER,
  ),
  validateRequest(accountSwitchValidation),
  userControllers.switchAccount,
);
// router.get(
//   '/profile',
//   auth(USER_ROLE.agencies, USER_ROLE.influencer),
//   userControllers.getme,
// );
// Block user
router.patch(
  '/block/:id',
  auth(USER_ROLE.USER, USER_ROLE.USER),
  userControllers.blockUser,
);

// Unblock user
router.patch(
  '/unblock/:id',
  auth(USER_ROLE.USER, USER_ROLE.USER),
  userControllers.unblockUser,
);

router.get(
  '/:id',
  auth(USER_ROLE.USER, USER_ROLE.USER),
  userControllers.getsingleUser,
);
router.get(
  '/',
  auth(USER_ROLE.USER, USER_ROLE.USER, USER_ROLE.admin),
  userControllers.getAllUsers,
);

router.delete(
  '/delete-account',
  auth(USER_ROLE.USER, USER_ROLE.MARCHANT),
  validateRequest(authValidation.deleteAccountZodSchema),
  userControllers.deleteAccount,
);

router.delete('/:id', auth(USER_ROLE.admin), userControllers.deleteUser);

export const userRoutes = router;
