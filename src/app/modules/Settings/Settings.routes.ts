import express from 'express';
import { SettingsController } from './Settings.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = express.Router();

// GET /api/v1/settings?role=MARCHANT              → MARCHANT এর সব settings
// GET /api/v1/settings?role=MARCHANT&type=privacy_policy → নির্দিষ্ট
// GET /api/v1/settings?role=KAATEDJ&type=about_us
// GET /api/v1/settings?role=ORGANIZER&type=terms_conditions
router.get('/data', SettingsController.getSettings);

// PATCH /api/v1/settings — Admin only
// body: { role: "MARCHANT", type: "privacy_policy", content: "<p>...</p>" }
router.patch(
  '/create',
  auth(USER_ROLE.admin),
  SettingsController.upsertSettings,
);

export const SettingsRoutes = router;
