import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { EventReviewReportService } from "./Eventreviewreport.service";

// ── Organizer — Report a review ───────────────────────────────────────────────
// POST /api/v1/event-reviews/:eventId/:reviewId/report
const reportEventReview = catchAsync(async (req: Request, res: Response) => {
//   const { ,  } = req.params;
  const { reason,reviewId,eventId } = req.body;

  const result = await EventReviewReportService.reportEventReview(
    req.user._id,
    eventId as string,
    reviewId as string,
    reason
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Review reported successfully",
    data: result,
  });
});



const getAllReports = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const search = req.query.search as string; // ← add

  const result = await EventReviewReportService.getAllEventReviewReports(
    page,
    limit,
    search // ← add
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports fetched successfully",
    data: result,
  });
});



// ── Controller ────────────────────────────────────────────────────────────────
// GET /api/v1/event-reviews/admin/reports/by-event/:eventId
const getReportsByEventId = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await EventReviewReportService.getReportsByEventId(
    eventId as string,
    page,
    limit
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports fetched successfully",
    data: result,
  });
});







// ── Admin — Delete review ─────────────────────────────────────────────────────
// DELETE /api/v1/event-reviews/admin/reports/:reportId
const deleteEventReview = catchAsync(async (req: Request, res: Response) => {
  const result = await EventReviewReportService.deleteEventReview(req.params.reportId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review deleted successfully",
    data: result,
  });
});

// ── Admin — Dismiss report ────────────────────────────────────────────────────
// PATCH /api/v1/event-reviews/admin/reports/:reportId/dismiss
const dismissReport = catchAsync(async (req: Request, res: Response) => {
  const result = await EventReviewReportService.dismissEventReviewReport(req.params.reportId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report dismissed successfully",
    data: result,
  });
});

export const EventReviewReportController = {
  reportEventReview,
  getAllReports,
  deleteEventReview,
  dismissReport,
  getReportsByEventId,
};