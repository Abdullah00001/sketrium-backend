import AppError from "../../error/AppError";
import { Product } from "../product/product.model";

import httpStatus from "http-status";
import { ProductReviewReport } from "./Productreviewreport.model";
import User from "../user/user.model";

// ── 1. Report Product Review (Host/User) ──────────────────────────────────────
const reportProductReview = async (
  reportedBy: string,
  productId: string,
  reviewId: string,
  reason: string
) => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  const review = product.reviews?.find(
    (r: any) => r._id.toString() === reviewId
  );
  if (!review) throw new AppError(httpStatus.NOT_FOUND, "Review not found");

  const alreadyReported = await ProductReviewReport.findOne({
    product: productId,
    review: reviewId,
    reportedBy,
  });
  if (alreadyReported) {
    throw new AppError(httpStatus.CONFLICT, "You have already reported this review");
  }

  const report = await ProductReviewReport.create({
    product: productId,
    review: reviewId,
    reportedBy,
    reason,
  });

  return report;
};




// ── Helper: review details with user ─────────────────────────────────────────
const buildReviewWithUser = async (report: any, productDoc: any) => {
  const review = productDoc?.reviews?.find(
    (r: any) => r._id.toString() === report.review.toString()
  );
 
  let reviewUser = null;
  if (review?.user) {
    reviewUser = await User.findById(review.user).select("fullName email image");
  }
 
  return {
    ...report,
    review: review
      ? {
          _id: (review as any)._id,
          rating: (review as any).rating,
          comment: (review as any).comment,
          images: (review as any).images,
          createdAt: (review as any).createdAt,
          updatedAt: (review as any).updatedAt,
          user: reviewUser,
        }
      : null,
  };
};







// ── 2. Get All Reports (Admin) with search ────────────────────────────────────
// const getAllProductReviewReports = async (
//   page: number = 1,
//   limit: number = 10,
//   search?: string
// ) => {
//   const skip = (page - 1) * limit;
 
//   const filter: any = { status: "pending" };
 
//   if (search && search.trim() !== "") {
//     const products = await Product.find({
//       name: { $regex: search.trim(), $options: "i" },
//     }).select("_id");
//     const users = await User.find({
//       fullName: { $regex: search.trim(), $options: "i" },
//     }).select("_id");
 
//     filter.$or = [
//       { product: { $in: products.map((p) => p._id) } },
//       { reportedBy: { $in: users.map((u) => u._id) } },
//     ];
//   }
 
//   const total = await ProductReviewReport.countDocuments(filter);
 
//   const reports = await ProductReviewReport.find(filter)
//     .populate("product", "name images price")
//     .populate("reportedBy", "fullName image email")
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .lean();
 
//   const reportsWithReview = await Promise.all(
//     reports.map(async (report: any) => {
//       const productDoc = await Product.findById(report.product._id).select("reviews");
//       return buildReviewWithUser(report, productDoc);
//     })
//   );
 
//   return {
//     reports: reportsWithReview,
//     pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
//   };
// };







const getAllProductReviewReports = async (
  page: number = 1,
  limit: number = 10,
  search?: string
) => {

  const skip = (page - 1) * limit;

  // ── Base Filter ───────────────────────────────────
  const filter: any = {
    status: "pending",
  };

  // ── Search ────────────────────────────────────────
  if (search && search.trim() !== "") {

    const [products, users] = await Promise.all([

      Product.find({
        name: {
          $regex: search.trim(),
          $options: "i",
        },
      }).select("_id"),

      User.find({
        fullName: {
          $regex: search.trim(),
          $options: "i",
        },
      }).select("_id"),

    ]);

    filter.$or = [

      {
        product: {
          $in: products.map((p) => p._id),
        },
      },

      {
        reportedBy: {
          $in: users.map((u) => u._id),
        },
      },
    ];
  }

  // ── Fetch Reports ─────────────────────────────────
  const [total, reports] = await Promise.all([

    ProductReviewReport.countDocuments(filter),

    ProductReviewReport.find(filter)

      .populate(
        "product",
        "name images price",
      )

      .populate(
        "reportedBy",
        "fullName image email",
      )

      .sort({ createdAt: -1 })

      .skip(skip)

      .limit(limit)

      .lean(),

  ]);

  // ── Build Review ──────────────────────────────────
  const reportsWithReview = await Promise.all(

    reports.map(async (report: any) => {

      // product deleted
      if (!report.product) {
        return null;
      }

      // reporter deleted
      if (!report.reportedBy) {
        return null;
      }

      // review missing
      if (!report.review) {
        return null;
      }

      // fetch product reviews
      const productDoc = await Product.findById(
        report.product._id,
      ).select("reviews");

      // product not found
      if (!productDoc) {
        return null;
      }

      // find review
      const review = productDoc.reviews?.find(
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
        ).select("fullName email image");
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

  // ── Remove Invalid Reports ─────────────────────────
  const cleanedReports = reportsWithReview.filter(
    (report: any) => report !== null,
  );

  // ── Return ─────────────────────────────────────────
  return {

    reports: cleanedReports,

    pagination: {
      total: cleanedReports.length,
      page,
      limit,
      totalPages: Math.ceil(cleanedReports.length / limit),
    },
  };
};





// ── 3. Delete Review (Admin) ──────────────────────────────────────────────────
const deleteProductReview = async (reportId: string) => {
  const report = await ProductReviewReport.findById(reportId);
  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");

  await Product.findByIdAndUpdate(report.product, {
    $pull: { reviews: { _id: report.review } },
  });

  await ProductReviewReport.findByIdAndUpdate(reportId, {
    $set: { status: "resolved" },
  });

  return { message: "Review deleted successfully" };
};

// ── 4. Dismiss Report (Admin) ─────────────────────────────────────────────────
const dismissProductReviewReport = async (reportId: string) => {
  const report = await ProductReviewReport.findByIdAndUpdate(
    reportId,
    { $set: { status: "dismissed" } },
    { new: true }
  );
  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found");
  return report;
};










// ── 3. Get Reports by Product ID ──────────────────────────────────────────────
const getReportsByProductId = async (
  productId: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const total = await ProductReviewReport.countDocuments({
    product: productId,
    status: "pending",
  });
 
  const reports = await ProductReviewReport.find({
    product: productId,
    status: "pending",
  })
    .populate("product", "name images price")
    .populate("reportedBy", "fullName image email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
 
  const productDoc = await Product.findById(productId).select("reviews");
 
  const reportsWithReview = await Promise.all(
    reports.map((report: any) => buildReviewWithUser(report, productDoc))
  );
 
  return {
    reports: reportsWithReview,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};











export const ProductReviewReportService = {
  reportProductReview,
  getAllProductReviewReports,
  deleteProductReview,
  dismissProductReviewReport,
  getReportsByProductId,
};