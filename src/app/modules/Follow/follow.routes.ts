import express from 'express';
import { FollowController } from './follow.controller';
import auth from '../../middleware/auth.middleware';
import { USER_ROLE } from '../user/user.constant';

const router = express.Router();

// POST /api/v1/follow/:userId — follow/unfollow toggle
router.post(
  '/:userId',
  auth(
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
  ),
  FollowController.toggle,
);

// GET /api/v1/follow/following — আমি কাদের follow করি
router.get(
  '/following',
  auth(
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
  ),
  FollowController.following,
);

// GET /api/v1/follow/followers — আমার followers
router.get(
  '/followers',
  auth(
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
  ),
  FollowController.followers,
);

// GET /api/v1/follow/status/:userId — follow status check
router.get(
  '/status/:userId',
  auth(
    USER_ROLE.ORGANIZER,
    USER_ROLE.MARCHANT,
    USER_ROLE.USER,
    USER_ROLE.KAATEDJ,
  ),
  FollowController.status,
);

export const FollowRoutes = router;
