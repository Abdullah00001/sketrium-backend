
import { Router } from "express";
import { USER_ROLE } from "../user/user.constant";
import upload from "../../middleware/fileUpload";
import auth from "../../middleware/auth.middleware";
import {  productController } from "./product.controller";


const router = Router();


// router.get("/all", auth(USER_ROLE.USER,),productController.getAllProducts);           // Manage Products list
router.get("/product-details/:id", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.getProductDetails);   // Product Details
router.post("/create-products", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), upload.array("images", 10), productController.createProduct);  // Add Product
router.put("/product-update/:id", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), upload.array("images", 10), productController.updateProduct); // Edit Product
router.delete("/delete-product/:id", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.deleteProduct);    // Delete Product
router.post("/review/:id", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.addProductReview); // Add Review





// ─────────────────────────────────────────────────────────────
// PRODUCT ROUTES (add to existing product router)
// ─────────────────────────────────────────────────────────────
// GET /products/trending
router.get("/all", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.getTrending);
 
// GET /products/featured
router.get("/products/featured", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.getFeatured);
 
// GET /products/categories
router.get("/products/categories", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.getCategories);
 
// GET /products/:id/related?category=skates
router.get("/products/:id/related", auth(USER_ROLE.USER,USER_ROLE.MARCHANT), productController.getRelated);


router.post("/product-review/:id", auth(USER_ROLE.USER),upload.fields([{ name: "image", maxCount: 1 }]), productController.addproductReview);


// 📊 SUMMARY API (totalOrders, totalProducts, totalSales)
router.get("/summary",  auth(USER_ROLE.USER), productController.getDashboardSummary);


// 📈 MONTHLY EARNINGS API
router.get("/monthly", auth(USER_ROLE.USER), productController.getMonthlyEarnings);



//dasbord api  MARCHANT all api 


 
// GET /api/v1/products/dashboard?year=2025
// Screen 1 — Home: Total Sales, Monthly Earning, Order List
router.get(
  "/dashboard",
  auth(USER_ROLE.USER,USER_ROLE.MARCHANT),
  productController.getProductDashboard
);
 
// GET /api/v1/products/earning?year=2025
// Screen 2 — Earning: Total Earning, Monthly Chart, Recent Transactions
router.get(
  "/earning",
  auth(USER_ROLE.USER,USER_ROLE.MARCHANT),
  productController.getEarningOverview
);
 
// GET /api/v1/products/orders?status=processing&page=1&limit=10
// Order list with filter
router.get(
  "/orders",
  auth(USER_ROLE.MARCHANT),
  productController.getMyOrders
);
 
// PATCH /api/v1/products/orders/:orderId/status
// Update order status (Mark Ready / Ship Now)
router.patch(
  "/orders/:orderId",
  auth(USER_ROLE.MARCHANT,USER_ROLE.USER),
  productController.updateOrderStatus
);


// GET  /api/v1/products/my-products — আমার সব products
router.get(
  "/my-products",
  auth(USER_ROLE.MARCHANT),
  productController.getMyProducts
);

// GET  /api/v1/products/:productId — single product
router.get(
  "/single-product/:productId",
  auth(USER_ROLE.MARCHANT),
  productController.getSingleProduct
);




// GET  /api/v1/products/manage-orders?status=all&page=1&limit=10
// status: all | pending | processing | shipped | delivered | cancelled
router.get(
  "/manage-orders",
  auth(USER_ROLE.MARCHANT),
  productController.getManageOrders
);
 
// GET  /api/v1/products/manage-orders/:orderId
router.get(
  "/manage-orders/:orderId",
  auth(USER_ROLE.MARCHANT),
  productController.getOrderDetails
);
 
// PATCH /api/v1/products/manage-orders/:orderId/status
// body: { "orderStatus": "delivered" }
router.patch(
  "/manage-orders/:orderId/status",
  auth(USER_ROLE.MARCHANT),
  productController.updateManageOrderStatus
);



router.get("/getproduct-reviews/:productId", productController.getReviewsByProduct);

router.get("/host/:hostId",auth(USER_ROLE.MARCHANT,USER_ROLE.USER), productController.getProductsByHost);

router.post("/reply", auth(USER_ROLE.MARCHANT), productController.addReviewReply);
export const productsRoutes = router;