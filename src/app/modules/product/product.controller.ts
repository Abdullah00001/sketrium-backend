import mongoose from "mongoose";
import AppError from "../../error/AppError";
import catchAsync from "../../utils/catchAsync";
import { uploadManyToS3, uploadToS3 } from "../../utils/fileHelper";
import sendResponse from "../../utils/sendResponse";
import { Product } from "./product.model";
import { productServices } from "./product.service";
import httpStatus  from 'http-status';



export const getAllProducts = catchAsync(async (req, res) => {
  const result = await productServices.getAllProductsService(req);
  sendResponse(res, { statusCode: 200, success: true, message: "Products fetched successfully", data: result });
});

export const getProductDetails = catchAsync(async (req, res) => {
  const result = await productServices.getProductDetailsService(req.params.id as string);
  sendResponse(res, { statusCode: 200, success: true, message: "Product details fetched successfully", data: result });
});

export const createProduct = catchAsync(async (req, res) => {
  let images: { id: string; url: string }[] = [];

  if (req.files && (req.files as any[]).length > 0) {
    images = await uploadManyToS3(
      (req.files as any[]).map((file: any) => ({
        file,
        path: "products/images",
      }))
    );
  }

  const result = await productServices.createProductService(req, images);
  sendResponse(res, { statusCode: 201, success: true, message: "Product created successfully", data: result });
});

export const updateProduct = catchAsync(async (req, res) => {
  let images: { id: string; url: string }[] = [];

  if (req.files && (req.files as any[]).length > 0) {
    images = await uploadManyToS3(
      (req.files as any[]).map((file: any) => ({
        file,
        path: "products/images",
      }))
    );
  }

  const result = await productServices.updateProductService(req, images);
  sendResponse(res, { statusCode: 200, success: true, message: "Product updated successfully", data: result });
});

export const deleteProduct = catchAsync(async (req, res) => {
  const result = await productServices.deleteProductService(req.params.id as string);
  sendResponse(res, { statusCode: 200, success: true, message: "Product deleted successfully", data: result });
});

export const addProductReview = catchAsync(async (req, res) => {
  const result = await productServices.addProductReviewService(req);
  sendResponse(res, { statusCode: 200, success: true, message: "Review added successfully", data: result });
});














// ✅ Exporting all controller functions as an object


// const getTrending = catchAsync(async (req, res) => {
//   const result = await productServices.getTrendingProducts(
//     req.query.limit ? Number(req.query.limit) : 8
//   );
//   sendResponse(res, {
//     statusCode: 200,
//     success: true,
//     message: "Trending products fetched",
//     data: result,
//   });
// });
 // নতুন — 4টা parameter


const getTrending = catchAsync(async (req, res) => {
  const categoryIds = (req.query.categoryIds as string)?.split(',').filter(Boolean) || [];

  // productId optional — na dile undefined pathabo
  const productId = req.params.productId || undefined;

  const result = await productServices.getTrendingProducts(
    productId as string | undefined,
    categoryIds,
    req.query.page ? Number(req.query.page) : 1,
    req.query.limit ? Number(req.query.limit) : 10,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products fetched successfully',
    data: result,
  });
});


 
const getFeatured = catchAsync(async (req, res) => {
  const result = await productServices.getFeaturedProducts(
    req.query.limit ? Number(req.query.limit) : 5
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Featured products fetched",
    data: result,
  });
});
 
 
const getRelated = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { category } = req.query;
 
  if (!category) {
    return sendResponse(res, {
      statusCode: 400,
      success: false,
      message: "category query param required",
      data: null,
    });
  }
 
  const result = await productServices.getRelatedProducts(
    id as string,
    category as string
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Related products fetched",
    data: result,
  });
});
 
 
const getCategories = catchAsync(async (req, res) => {
  const result = await productServices.getProductCategories();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Product categories fetched",
    data: result,
  });
});
 
//dasbord extra features end here


// 📊 GET DASHBOARD DATA (SUMMARY + MONTHLY)
export const getDashboardSummary = catchAsync(async (req, res) => {
  const result = await productServices.getDashboardSummaryService(req);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Dashboard summary fetched successfully",
    data: result,
  });
});




export const getMonthlyEarnings = catchAsync(async (req, res) => {
  const result = await productServices.getMonthlyEarningsService(req);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Monthly earnings fetched successfully",
    data: result,
  });
});









//dashboard extra features end here



// ── Home Dashboard ────────────────────────────────────────────────────────────

// GET /api/v1/products/dashboard?year=2025&page=1&limit=10
const getProductDashboard = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
 
  const result = await productServices.getProductDashboard(
    userId,
    year,
    page,
    limit
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard fetched successfully",
    data: result,
  });
});
 
// GET /api/v1/products/earning?year=2025&page=1&limit=10
const getEarningOverview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
 
  const result = await productServices.getEarningOverview(userId, year, page, limit);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Earning overview fetched successfully",
    data: result,
  });
});
 
// GET /api/v1/products/orders?status=processing&page=1&limit=10
const getMyOrders = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { status, page, limit } = req.query;
 
  const result = await productServices.getMyOrders(
    userId,
    status as string,
    page ? Number(page) : 1,
    limit ? Number(limit) : 10
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched successfully",
    data: result,
  });
});

 






// PATCH /api/v1/products/orders/:orderId/status
const updateOrderStatus = catchAsync(async (req, res) => {

  const { orderId } = req.params;

  const { orderStatus } = req.body;

  const result = await productServices.updateOrderStatus(
    req.user._id as string,
    orderId as string,
    orderStatus as any
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Order status updated successfully",
    data: result,
  });
});

// GET /api/v1/products/my-products?page=1&limit=10
const getMyProducts = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
 
  const result = await productServices.getMyProducts(userId, page, limit);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched successfully",
    data: result,
  });
});
 
// GET /api/v1/products/:productId
const getSingleProduct = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await productServices.getSingleProduct(userId, req.params.productId as string);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product fetched successfully",
    data: result,
  });
});
 

 
//oder management for marchant dashboard

// GET /api/v1/products/manage-orders?status=all&page=1&limit=10
const getManageOrders = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { status, page, limit } = req.query;
 
  const result = await productServices.getManageOrders(
    userId,
    status as string,
    page ? Number(page) : 1,
    limit ? Number(limit) : 10
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched successfully",
    data: result,
  });
});
 
// GET /api/v1/products/manage-orders/:orderId
const getOrderDetails = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await productServices.getOrderDetails(userId, req.params.orderId as string);
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order details fetched successfully",
    data: result,
  });
});
 
// PATCH /api/v1/products/manage-orders/:orderId/status
const updateManageOrderStatus = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { orderStatus } = req.body;
 
  const result = await productServices.updateManageOrderStatus(
    userId,
    req.params.orderId as string,
    orderStatus
  );
 
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order status updated successfully",
    data: result,
  });
});







export const addproductReview = catchAsync(async (req, res) => {
  const { id } = req.params;

  const userId = req.user?.id;



  const event = await Product.findById(id);

  if (!event) {
    throw new AppError(404, "Product not found");
  }

  // ✅ ensure reviews array exists (fix TS + runtime issue)
  if (!event.reviews) {
    event.reviews = [];
  }

  // ❌ prevent duplicate review
  const alreadyReviewed = event.reviews.find(
    (r: any) => r.user.toString() === userId.toString()
  );

  if (alreadyReviewed) {
    throw new AppError(400, "You already reviewed this product");
  }

  // ✅ single image upload
  let image = { id: "", url: "" };

  if (req.files && (req.files as any).image) {
    const file = (req.files as any).image[0];
    image = await uploadToS3(file, "events/reviews");
  }

  // ✅ create review
  const newReview = {
    user: userId,
    rating: Number(req.body.rating),
    comment: req.body.comment,
    images: image.url ? [image] : [],
    isAnonymous: req.body.isAnonymous || false,
  };

  // ✅ push review
  event.reviews.push(newReview as any);

  await event.save();

  res.status(201).json({
    success: true,
    message: "Review added successfully",
    data: newReview,
  });
});

// const getReviewsByProduct = catchAsync(async (req, res) => {
//   const page = Number(req.query.page) || 1;
//   const limit = Number(req.query.limit) || 10;

//   const result = await productServices.getReviewsByProduct(
//     req.params.productId as string,
//     page,
//     limit
//   );

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "Product reviews fetched successfully",
//     meta: result.meta,
//     data: result.data,
//   });
// });

const getReviewsByProduct = catchAsync(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const result = await productServices.getReviewsByProduct(
    req.params.productId as string,
    page,
    limit,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product reviews fetched successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getProductsByHost = catchAsync(async (req, res) => {
  const hostId = req.params.hostId as string;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const categoryId = req.query.categoryId as string; // ✅ নতুন

  const result = await productServices.getProductsByHost(hostId, page, limit, categoryId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Products fetched successfully",
    data: result,
  });
});

// product.controller.ts
const addReviewReply = catchAsync(async (req, res) => {
  // const { productId, reviewId } = req.params;
  const userId = req.user._id; // auth middleware থেকে আসবে
  const { comment,productId,reviewId } = req.body;

  const result = await productServices.addReviewReply(
    productId as string,
    reviewId as string,
    userId,
    comment
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reply added successfully",
    data: result,
  });
});



export const productController = {
    getAllProducts,
    getProductDetails,
    createProduct,
    updateProduct,
    deleteProduct,
    addProductReview,
    // extra features
   getTrending,
   getFeatured,
   getRelated,
   getCategories,
  getDashboardSummary,
  getMonthlyEarnings,
  addproductReview,
  getProductDashboard,
  getEarningOverview,
  getMyOrders,
  updateOrderStatus,
  getMyProducts,
  getSingleProduct,
  getManageOrders,
  getOrderDetails,
  updateManageOrderStatus,
  getReviewsByProduct,
  getProductsByHost,
  addReviewReply,
};
