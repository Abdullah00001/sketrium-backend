import express from "express";
import { NotificationController } from "./notifications.controller";
import { USER_ROLE } from "../../user/user.constant";
import auth from "../../../middleware/auth.middleware";

 
const router = express.Router();
 
// POST /api/v1/notifications/send — Admin notification পাঠাবে
router.post(
  "/send",
  auth(USER_ROLE.admin),
  NotificationController.sendCustomNotification
);
 
// GET /api/v1/notifications/history — Admin notification history দেখবে
router.get(
  "/history",
  //  auth(USER_ROLE.admin),
  NotificationController.getNotificationHistory
);
 
export const NotificationRoutes = router;
