import AppError from "../../error/AppError";
import { Event } from "../event/event.model";

import httpStatus from "http-status";
import { EventReviewReport } from "./Eventreviewreport.model";
import User from "../user/user.model";


// ── 1. Report Event Review (Organizer) ───────────────────────────────────────
const reportEventReview = async (
  organizerId: string,
  eventId: string,
  reviewId: string,
  reason: string
) => {
  // Event আছে কিনা check
  const event = await Event.findById(eventId);
  if (!event) throw new AppError(httpStatus.NOT_FOUND, "Event not found");

  // Review আছে কিনা check
  const review = event.reviews?.find(
    (r: any) => r._id.toString() === reviewId
  );
  if (!review) throw new AppError(httpStatus.NOT_FOUND, "Review not found");

  // Already report করা আছে কিনা
  const alreadyReported = await EventReviewReport.findOne({
    event: eventId,
    review: reviewId,
    reportedBy: organizerId,
  });
  if (alreadyReported) {
    throw new AppError(httpStatus.CONFLICT, "You have already reported this review");
  }

  const report = await EventReviewReport.create({
    event: eventId,
    review: reviewId,
    reportedBy: organizerId,
    reason,
  });

  return report;
};


const getAllEventReviewReports = async (
  page: number = 1,
  limit: number = 10,
  search?: string,
) => {

  const skip = (page - 1) * limit;

  // ── Base Filter ─────────────────────────────────────
  const filter: any = {
    status: 'pending',
  };

  // ── Search Filter ───────────────────────────────────
  if (search && search.trim() !== '') {

    const [events, users] = await Promise.all([

      Event.find({
        title: {
          $regex: search.trim(),
          $options: 'i',
        },
      }).select('_id'),

      User.find({
        fullName: {
          $regex: search.trim(),
          $options: 'i',
        },
      }).select('_id'),

    ]);

    filter.$or = [
      {
        event: {
          $in: events.map((e) => e._id),
        },
      },
      {
        reportedBy: {
          $in: users.map((u) => u._id),
        },
      },
    ];
  }

  // ── Fetch Reports ───────────────────────────────────
  const [total, reports] = await Promise.all([

    EventReviewReport.countDocuments(filter),

    EventReviewReport.find(filter)

      .populate(
        'event',
        'title coverImage date location time price',
      )

      .populate(
        'reportedBy',
        'fullName image email',
      )

      .sort({ createdAt: -1 })

      .skip(skip)

      .limit(limit)

      .lean(),

  ]);

  // ── Attach Review ───────────────────────────────────
  const reportsWithReview = await Promise.all(

    reports.map(async (report: any) => {

      // event deleted
      if (!report.event) {
        return null;
      }

      // reported user deleted
      if (!report.reportedBy) {
        return null;
      }

      // review id missing
      if (!report.review) {
        return null;
      }

      // fetch event reviews
      const eventDoc = await Event.findById(
        report.event._id,
      ).select('reviews');

      if (!eventDoc) {
        return null;
      }

      // find review
      const review = eventDoc.reviews?.find(
        (r: any) =>
          r._id.toString() === report.review.toString(),
      );

      // review deleted
      if (!review) {
        return null;
      }

      // review user
      let reviewUser = null;

      if ((review as any).user) {

        reviewUser = await User.findById(
          (review as any).user,
        ).select('fullName email image');
      }

      return {

        ...report,

        review: {

          _id: (review as any)._id,

          rating: (review as any).rating,

          comment: (review as any).comment,

          isAnonymous: (review as any).isAnonymous,

          images: (review as any).images,

          createdAt: (review as any).createdAt,

          updatedAt: (review as any).updatedAt,

          user: reviewUser,
        },
      };
    }),
  );

  // ── Remove Null Reports ─────────────────────────────
  const cleanedReports = reportsWithReview.filter(
    (report: any) => report !== null,
  );

  // ── Return ──────────────────────────────────────────
  return {

    reports: cleanedReports,

    meta: {
      total: cleanedReports.length,
      page,
      limit,
      totalPages: Math.ceil(cleanedReports.length / limit),
    },
  };
};






// ── Get Reports by Event ID ───────────────────────────────────────────────────
const getReportsByEventId = async (
  eventId: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const total = await EventReviewReport.countDocuments({
    event: eventId,
    status: "pending",
  });

  const reports = await EventReviewReport.find({
    event: eventId,
    status: "pending",
  })
    .populate("event", "title coverImage date location time price")
    .populate("reportedBy", "fullName image email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const reportsWithReview = await Promise.all(
    reports.map(async (report: any) => {
      const eventDoc = await Event.findById(report.event._id).select("reviews");
      const review = eventDoc?.reviews?.find(
        (r: any) => r._id.toString() === report.review.toString()
      );

      let reviewUser = null;
      if (review?.user) {
        reviewUser = await User.findById(review.user).select(
          "fullName email image"
        );
      }

      return {
        ...report,
        review: review
          ? {
              _id: (review as any)._id,
              rating: (review as any).rating,
              comment: (review as any).comment,
              isAnonymous: (review as any).isAnonymous,
              images: (review as any).images,
              createdAt: (review as any).createdAt,
              updatedAt: (review as any).updatedAt,
              user: reviewUser,
            }
          : null,
      };
    })
  );

  return {
    reports: reportsWithReview,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};













// ── 3. Delete Review (Admin) ──────────────────────────────────────────────────
const deleteEventReview = async (reportId: string) => {
  const report = await EventReviewReport.findById(reportId);
  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");

  // Event থেকে review টা pull করো
  await Event.findByIdAndUpdate(report.event, {
    $pull: { reviews: { _id: report.review } },
  });

  // Report status resolved করো
  await EventReviewReport.findByIdAndUpdate(reportId, {
    $set: { status: "resolved" },
  });

  return { message: "Review deleted successfully" };
};

// ── 4. Dismiss Report (Admin) ─────────────────────────────────────────────────
const dismissEventReviewReport = async (reportId: string) => {
  const report = await EventReviewReport.findByIdAndUpdate(
    reportId,
    { $set: { status: "dismissed" } },
    { new: true }
  );
  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");
  return report;
};

export const EventReviewReportService = {
  reportEventReview,
  getAllEventReviewReports,
  deleteEventReview,
  dismissEventReviewReport,
  getReportsByEventId,
};