import { Router } from 'express';

import { adminControllers } from './admin.controller';
// import upload from '../../../middleware/fileUpload';
import auth from '../../../middleware/auth.middleware';
import upload from '../../../middleware/fileUpload';
import { USER_ROLE } from '../../user/user.constant';

const router = Router();

router.post('/adminRegister', adminControllers.adminRegister);

router.post('/login', adminControllers.adminLogin);
router.get('/get-profile', auth(USER_ROLE.admin), adminControllers.getProfile);

router.patch(
  '/update-profile',
  auth(USER_ROLE.admin),
  upload.single('file'),
  adminControllers.updateProfile,
);
router.patch(
  '/change-password',
  auth(USER_ROLE.admin),
  adminControllers.changePassword,
);

router.post('/forgot-password', adminControllers.forgotPassword);
router.post('/verify-otp', adminControllers.verifyOtp);
router.post('/reset-password', adminControllers.resetPassword);

// GET /api/v1/admin/dashboard
// GET /api/v1/admin/dashboard?year=2025&type=tickets&page=1&limit=10
// GET /api/v1/admin/dashboard?type=orders

router.get(
  '/dashboard',
  auth(USER_ROLE.admin),
  adminControllers.getAdminDashboard,
);

// GET  /api/v1/admin/users?search=john&page=1&limit=10
router.get('/allusers', auth(USER_ROLE.admin), adminControllers.getAllUsers);

// GET  /api/v1/admin/users/:userId
router.get(
  '/users/:userId',
  auth(USER_ROLE.admin),
  adminControllers.getSingleUser,
);

// PATCH /api/v1/admin/users/:userId/block
router.patch(
  '/block/:userId',
  auth(USER_ROLE.admin),
  adminControllers.blockUser,
);

// PATCH /api/v1/admin/users/:userId/unblock
router.patch(
  '/unblock/:userId',
  auth(USER_ROLE.admin),
  adminControllers.unblockUser,
);

// DELETE /api/v1/admin/users/:userId
router.delete(
  '/users/:userId',
  auth(USER_ROLE.admin),
  adminControllers.deleteUser,
);

export const adminRoutes = router;
