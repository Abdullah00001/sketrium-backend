import express from 'express';
import { SettingsController } from './Settings.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = express.Router();

// GET /api/v1/settings/data
// GET /api/v1/settings/data?type=privacy_policy
router.get('/data', SettingsController.getSettings);

// PATCH /api/v1/settings/create — Admin only
// body: { type: "privacy_policy", content: "<p>...</p>" }
router.patch(
  '/create',
  auth(USER_ROLE.admin),
  SettingsController.upsertSettings,
);

export const SettingsRoutes = router;
