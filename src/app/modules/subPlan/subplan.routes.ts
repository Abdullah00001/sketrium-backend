import { Router } from 'express';

import auth from '../../middleware/auth.middleware';
import { SubscriptionPlanController } from './subplan.controller';
import { USER_ROLE } from '../user/user.constant';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/getAllPlans', SubscriptionPlanController.getAllPlans);
router.get('/getPlanById/:id', SubscriptionPlanController.getPlanById);

// ─── Admin Only ───────────────────────────────────────────────────────────────
router.post(
  '/create-subplan',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  SubscriptionPlanController.createPlan,
);
router.patch(
  '/updatePlan/:id',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  SubscriptionPlanController.updatePlan,
);
router.delete(
  '/deletePlan/:id',
  auth(USER_ROLE.USER, USER_ROLE.admin),
  SubscriptionPlanController.deletePlan,
);

router.get(
  '/subscription-plans/:role',
  SubscriptionPlanController.getSubscriptionPlansByRole,
);

export const PlanRoutes = router;
