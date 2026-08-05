import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { ProductReviewReportService } from "./Productreviewreport.service";


// POST /api/v1/product-reviews/:productId/:reviewId/report
const reportProductReview = catchAsync(async (req: Request, res: Response) => {
//   const { productId, reviewId } = req.params;
  const { reason ,productId, reviewId} = req.body;

  const result = await ProductReviewReportService.reportProductReview(
    req.user._id,
    productId as string,
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

// GET /api/v1/product-reviews/admin/reports?search=john&page=1&limit=10
const getAllReports = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const search = req.query.search as string;
 
  const result = await ProductReviewReportService.getAllProductReviewReports(
    page,
    limit,
    search
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports fetched successfully",
    data: result,
  });
});


// DELETE /api/v1/product-reviews/admin/reports/:reportId
const deleteProductReview = catchAsync(async (req: Request, res: Response) => {
  const result = await ProductReviewReportService.deleteProductReview(req.params.reportId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Review deleted successfully",
    data: result,
  });
});

// PATCH /api/v1/product-reviews/admin/reports/:reportId/dismiss
const dismissReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ProductReviewReportService.dismissProductReviewReport(req.params.reportId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report dismissed successfully",
    data: result,
  });
});







 // GET /api/v1/product-reviews/admin/reports/by-product/:productId
const getReportsByProductId = catchAsync(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
 
  const result = await ProductReviewReportService.getReportsByProductId(
    productId as string,
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








export const ProductReviewReportController = {
  reportProductReview,
  getAllReports,
  deleteProductReview,
  dismissReport,
  getReportsByProductId,
};