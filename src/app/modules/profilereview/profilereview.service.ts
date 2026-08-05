import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import { Report, Review } from './profilereview.model';
import { deleteFromS3, uploadToS3 } from '../../utils/fileHelper';
import { IReport } from './profilereview.interface';
import mongoose from 'mongoose';


// ─── 1. Write Review ───────────────────────────────────────────────────────────
const createReview = async (
  reviewerId: string,
  payload: {
    organizer: string;
    rating: number;
    comment: string;
    isAnonymous?: boolean;
  },
  file?: Express.Multer.File,
) => {
  // const alreadyReviewed = await Review.findOne({
  //   reviewer: reviewerId,
  //   organizer: payload.organizer,
  // });
  // if (alreadyReviewed) {
  //   throw new AppError(httpStatus.CONFLICT, 'You have already reviewed this organizer');
  // }

  let imageData = {};
  if (file) {
    const uploaded = await uploadToS3(file, 'reviews');
    imageData = { image: { id: uploaded.id, url: uploaded.url } };
  }

  const result = await Review.create({
    ...payload,
    reviewer: reviewerId,
    ...imageData,
  });

  return result.populate([
    { path: 'reviewer', select: 'fullName image' },
    { path: 'organizer', select: 'fullName image' },
  ]);
};

// ─── 2. Get Organizer Reviews ──────────────────────────────────────────────────
const getOrganizerReviews = async (
  organizerId: string,
  page = 1,
  limit = 10,
) => {
  const skip = (page - 1) * limit;

  const total = await Review.countDocuments({
    organizer: organizerId,
    isDeleted: { $ne: true },
  });

  const reviews = await Review.find({ organizer: organizerId })
    .populate('reviewer', 'fullName image')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .then((docs) =>
      docs.map((doc) => ({
        ...doc,
        reviewer: doc.isAnonymous ? null : doc.reviewer,
      })),
    );

  const ratingData = await Review.aggregate([
    {
      $match: {
        organizer: { $toObjectId: organizerId },
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        total: { $sum: 1 },
      },
    },
  ]);

  const avgRating = ratingData[0]?.avgRating?.toFixed(1) || 0;

  return {
    reviews,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    avgRating,
  };
};

// ─── 3. Report Review ─────────────────────────────────────────────────────────
const reportReview = async (
  reportedBy: string,
  reviewId: string,
  reason: IReport,
) => {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError(httpStatus.NOT_FOUND, 'Review not found');

  const alreadyReported = await Report.findOne({ review: reviewId, reportedBy });
  if (alreadyReported) {
    throw new AppError(httpStatus.CONFLICT, 'You have already reported this review');
  }

  const result = await Report.create({ review: reviewId, reportedBy, reason });
  return result;
};

// ─── 4. Admin: Get All Reports ─────────────────────────────────────────────────
const getAllReports = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const total = await Report.countDocuments({ status: 'pending' });

  const reports = await Report.find({ status: 'pending' })
    .populate({
      path: 'review',
      populate: [
        { path: 'reviewer', select: 'fullName image email' },
        { path: 'organizer', select: 'fullName image email' },
      ],
    })
    .populate('reportedBy', 'fullName image email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    reports,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ─── 5. Admin: Remove Review ───────────────────────────────────────────────────
const removeReview = async (reportId: string) => {
  const report = await Report.findById(reportId).populate('review');
  if (!report) throw new AppError(httpStatus.NOT_FOUND, 'Report not found');

  const review = report.review as any;

  if (review?.image?.id) {
    await deleteFromS3(review.image.id);
  }

  await Review.findByIdAndUpdate(review._id, { isDeleted: true });
  await Report.findByIdAndUpdate(reportId, { status: 'resolved' });

  return { message: 'Review removed successfully' };
};

// ─── 6. Admin: Dismiss Report ──────────────────────────────────────────────────
const dismissReport = async (reportId: string) => {
  const report = await Report.findById(reportId);
  if (!report) throw new AppError(httpStatus.NOT_FOUND, 'Report not found');

  await Report.findByIdAndUpdate(reportId, { status: 'resolved' });
  return { message: 'Report dismissed successfully' };
};
















// // ── Reply to review ───────────────────────────────────────────────────────────
// const replyToReview = async (
//   organizerId: string,
//   reviewId: string,
//   comment: string
// ) => {
//   const review = await Review.findById(reviewId);
 
//   if (!review) throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
 
//   // শুধু ওই organizer reply দিতে পারবে যার review এটা
//   if (review.organizer.toString() !== organizerId.toString()) {
//     throw new AppError(httpStatus.FORBIDDEN, 'You can only reply to your own reviews');
//   }
 
//   // already reply আছে কিনা check
//   if (review.reply) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'You have already replied to this review');
//   }
 

// review.reply = {
//   organizer: new mongoose.Types.ObjectId(organizerId), // ← string → ObjectId
//   comment,
// };
 
//   await review.save();
//   return review;
// };
 
// ── Update reply ──────────────────────────────────────────────────────────────
const updateReply = async (
  organizerId: string,
  reviewId: string,
  comment: string
) => {
  const review = await Review.findById(reviewId);
    console.log('Review found for update:', review); // Debug log
  if (!review) throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
 
  // if (review.organizer.toString() !== organizerId.toString()) {
  //   throw new AppError(httpStatus.FORBIDDEN, 'You can only update your own reply');
  // }
 
  if (!review.reply) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No reply found to update');
  }
 
  review.reply.comment = comment;
  await review.save();
  return review;
};
 
// ── Delete reply ──────────────────────────────────────────────────────────────
const deleteReply = async (organizerId: string, reviewId: string) => {
  const review = await Review.findById(reviewId);
 
  if (!review) throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
 
  if (review.organizer.toString() !== organizerId.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'You can only delete your own reply');
  }
 
  review.reply = null;
  await review.save();
  return review;
};







// ── Service ───────────────────────────────────────────────────────────────────
const getMyReviews = async (organizerId: string) => {
  const reviews = await Review.find({ organizer: organizerId })
    .populate('reviewer', 'name email profileImage')
    .populate('reply.organizer', 'name email profileImage')
    .sort({ createdAt: -1 });
  return reviews;
};
 




// ─── Get Reviews By User ───────────────────────────────────────────────────────
const getReviewsByUser = async (
  userId: string,
  page = 1,
  limit = 10
) => {
  const skip = (page - 1) * limit;

  const query = {
    organizer: new mongoose.Types.ObjectId(userId),
  };

  const reviews = await Review.find(query)
    .populate('organizer', 'fullName image')
    .populate('reviewer', 'fullName image')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Review.countDocuments(query);

  return {
    data: reviews,
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    
  };
};










// ── 5. Reply to Review ────────────────────────────────────────────
const replyToReview = async (
  reviewId: string,
  organizerId: string,
  comment: string,
) => {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found');
  }

  // if (review.organizer.toString() !== organizerId) {
  //   throw new AppError(
  //     httpStatus.FORBIDDEN,
  //     'Only the reviewed organizer can reply to this review',
  //   );
  // }

  if (review.reply) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'A reply already exists for this review',
    );
  }

  review.reply = { organizer: organizerId, comment, isRead: false } as any;
  await review.save();

  return review.reply;
};







export const reviewServices = {
  createReview,
  getOrganizerReviews,
  reportReview,
  getAllReports,
  removeReview,
  dismissReport,
  getMyReviews,
  // replyToReview,
  updateReply,
  deleteReply,
  getReviewsByUser,
  replyToReview,
};