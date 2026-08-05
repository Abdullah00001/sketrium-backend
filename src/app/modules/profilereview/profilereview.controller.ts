import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { reviewServices } from './profilereview.service';


const createReview = catchAsync(async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File | undefined;

  // ← organizerId params থেকে নাও, body তে নেই
  const payload = {
    ...req.body,
    organizer: req.params.organizerId,
  };

  const result = await reviewServices.createReview(req.user._id, payload, file);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Review posted successfully',
    data: result,
  });
});

const getOrganizerReviews = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewServices.getOrganizerReviews(
    req.params.organizerId as string,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews fetched successfully',
    data: result,
  });
});

const reportReview = catchAsync(async (req: Request, res: Response) => {

   const { reason,reviewId } = req.body;
  
  const result = await reviewServices.reportReview(
    req.user._id,
    reviewId  as string,
    reason,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Review reported successfully',
    data: result,
  });
});

const getAllReports = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewServices.getAllReports(
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reports fetched successfully',
    data: result,
  });
});

const removeReview = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewServices.removeReview(req.params.reportId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Review removed successfully',
    data: result,
  });
});

const dismissReport = catchAsync(async (req: Request, res: Response) => {
  const result = await reviewServices.dismissReport(req.params.reportId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report dismissed successfully',
    data: result,
  });
});



// // ── POST /:reviewId/reply — reply দাও ────────────────────────────────────────
// const replyToReview = catchAsync(async (req: Request, res: Response) => {
//   const organizerId = req.user._id;
//   const { reviewId } = req.params;
//   const { comment } = req.body;
 
//   const result = await reviewServices.replyToReview(
//     organizerId,
//     reviewId as string,
//     comment
//   );
 
//   sendResponse(res, {
//     statusCode: httpStatus.CREATED,
//     success: true,
//     message: 'Reply added successfully',
//     data: result,
//   });
// });
 
// ── PATCH /:reviewId/reply — reply update করো ────────────────────────────────
const updateReply = catchAsync(async (req: Request, res: Response) => {
  const organizerId = req.user._id;
  const { reviewId } = req.params;
  const { comment } = req.body;
   console.log("reviewId →", reviewId); // ← add করো
 
  const result = await reviewServices.updateReply(
    organizerId,
    reviewId as string,
    comment
  );
 console.log('Reply updated:', result); // Debug log
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reply updated successfully',
    data: result,
  });
});
 
// ── DELETE /:reviewId/reply — reply মুছো ─────────────────────────────────────
const deleteReply = catchAsync(async (req: Request, res: Response) => {
  const organizerId = req.user._id;
  const { reviewId } = req.params;
 
  const result = await reviewServices.deleteReply(organizerId, reviewId as string);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reply deleted successfully',
    data: result,
  });
});












// GET /api/v1/reviews/my-reviews
const getMyReviews = catchAsync(async (req: Request, res: Response) => {
  const organizerId = req.user._id;
  const result = await reviewServices.getMyReviews(organizerId);
 
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'My reviews fetched successfully',
    data: result,
  });
});









// ─── Get Reviews By User ───────────────────────────────────────────────────────
// ─── Get Reviews By User ───────────────────────────────────────────────────────
const getReviewsByUser = catchAsync(async (req: Request, res: Response) => {

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const result = await reviewServices.getReviewsByUser(
    req.params.userId as string,
    page,
    limit
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reviews fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

// ── 5. Reply to Review (organizer) ───────────────────────────────
const replyToReview = catchAsync(async (req: Request, res: Response) => {
  const { reviewId,comment } =req.body
  const organizerId = req.user?.userId;
  const result = await reviewServices.replyToReview(
    reviewId as string,
    organizerId,
    comment,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reply added successfully',
    data: result,
  });
});


export const reviewController = {
  createReview,
  getOrganizerReviews,
  reportReview,
  getAllReports,
  removeReview,
  dismissReport,
  // replyToReview,
  updateReply,
  deleteReply,
  getMyReviews,
  getReviewsByUser,
  replyToReview
};