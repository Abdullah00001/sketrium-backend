import express from "express";

import { USER_ROLE } from "../user/user.constant";
import auth from "../../middleware/auth.middleware";
import { EventReviewReportController } from "./Eventreviewreport.controller";

const router = express.Router();

// ── Organizer — report a review ───────────────────────────────────────────────
// POST /api/v1/event-reviews/:eventId/:reviewId/report
router.post(
  "/report",
  auth(USER_ROLE.ORGANIZER,),
  EventReviewReportController.reportEventReview
);

// ── Admin — get all reports ───────────────────────────────────────────────────
// GET /api/v1/event-reviews/admin/reports
router.get(
  "/admin/reports",
  auth(USER_ROLE.admin),
  EventReviewReportController.getAllReports
);



// ── Route ─────────────────────────────────────────────────────────────────────
// GET /api/v1/event-reviews/admin/reports/by-event/:eventId?page=1&limit=10
router.get(
  "/by-event/:eventId",
  auth(USER_ROLE.admin),
  EventReviewReportController.getReportsByEventId
);




// ── Admin — delete review ─────────────────────────────────────────────────────
// DELETE /api/v1/event-reviews/admin/reports/:reportId
router.delete(
  "/admin/reports/:reportId",
  auth(USER_ROLE.admin),
  EventReviewReportController.deleteEventReview
);

// ── Admin — dismiss report ────────────────────────────────────────────────────
// PATCH /api/v1/event-reviews/admin/reports/:reportId/dismiss
router.patch(
  "/admin/reports/:reportId/dismiss",
  auth(USER_ROLE.admin),
  EventReviewReportController.dismissReport
);

export const EventReviewReportRoutes = router;