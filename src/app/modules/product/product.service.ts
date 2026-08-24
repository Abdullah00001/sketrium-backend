import mongoose, { Types } from 'mongoose';
import AppError from '../../error/AppError';
import { Order } from '../userOrder/userOrder.model';
import { Product } from './product.model';
import httpStatus from 'http-status';

// ✅ Get All Products
export const getAllProductsService = async (req: any) => {
  const userId = req.user?.id;
  const products = await Product.find({ host: userId })
    .populate('host', 'fullName image')
    .sort({ createdAt: -1 });
  return products;
};

// ✅ Get Product Details
export const getProductDetailsService = async (id: string) => {
  const product = await Product.findById(id)
    .populate('host', 'fullName image')
    .populate('reviews.user', 'fullName image');
  if (!product) throw new AppError(404, 'Product not found');
  return product;
};

// ✅ Create Product

// export const createProductService = async (
//   req: any,
//   images: { id: string; url: string }[]
// ) => {
//   const userId = req.user?.id;
//   const {
//     name,
//     category,
//     description,
//     price,
//     discount,
//     stock,
//     shippingCost,
//     colors,
//     sizes,
//     material,
//   } = req.body;

//   if (!name || !category || !price || !stock)
//     throw new AppError(400, "Name, category and price are required");

//   const product = await Product.create({
//     name,
//     category,
//     description: description || "",
//     price: Number(price),
//     discount: Number(discount) || 0,
//     stock: stock|| 0,
//     shippingCost: Number(shippingCost) || 0,
//     colors: colors ? JSON.parse(colors) : [],
//     sizes: sizes ? JSON.parse(sizes) : [],
//     images: images || [],
//     host: userId,
//     material: material || "",
//   });

//   return product;
// };

export const createProductService = async (
  req: any,
  images: { id: string; url: string }[],
) => {
  const userId = req.user?.id;
  const {
    name,
    category,
    description,
    price,
    discount,
    currency,
    stock,
    shippingCost,
    colors,
    sizes,
    material,
  } = req.body;

  if (!name || !category || !price || !stock)
    throw new AppError(400, 'Name, category and price are required');

  const numericPrice = Number(price);
  const numericDiscount = Number(discount) || 0;

  // ✅ discountPrice calculate
  const discountPrice = numericPrice - (numericPrice * numericDiscount) / 100;

  console.log('Calculated discountPrice:', discountPrice);

  const product = await Product.create({
    name,
    category,
    currency: currency || 'USD', // ✅ default currency
    description: description || '',
    price: numericPrice,
    discount: numericDiscount,
    discountPrice, // ✅ save in DB
    stock: stock || 0,
    shippingCost: Number(shippingCost) || 0,
    colors: colors ? JSON.parse(colors) : [],
    sizes: sizes ? JSON.parse(sizes) : [],
    images: images || [],
    host: userId,
    material: material || '',
  });

  return product;
};

// ✅ Update Product
export const updateProductService = async (
  req: any,
  images?: { id: string; url: string }[],
) => {
  const { id } = req.params;
  const {
    name,
    category,
    description,
    currency,
    price,
    discount,
    stock,
    shippingCost,
    colors,
    sizes,
  } = req.body;

  const updateData: any = {
    ...(name && { name }),
    ...(category && { category }),
    ...(description && { description }),
    ...(price && { price: Number(price) }),
    ...(discount && { discount: Number(discount) }),
    ...(stock && { stock: Number(stock) }),
    ...(shippingCost && { shippingCost: Number(shippingCost) }),
    ...(colors && { colors: JSON.parse(colors) }),
    ...(sizes && { sizes: JSON.parse(sizes) }),
    ...(images && images.length > 0 && { images }),
    ...(currency && { currency }), // ✅ currency update
  };

  const product = await Product.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!product) throw new AppError(404, 'Product not found');
  return product;
};

// ✅ Delete Product
export const deleteProductService = async (id: string) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  );
  if (!product) throw new AppError(404, 'Product not found');
  return { message: 'Product deleted successfully' };
};

// ✅ Add Review
export const addProductReviewService = async (req: any) => {
  const userId = req.user?.id;
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!rating || !comment)
    throw new AppError(400, 'Rating and comment are required');

  const product = await Product.findById(id);
  if (!product) throw new AppError(404, 'Product not found');

  const alreadyReviewed = product.reviews?.some(
    (review: any) => review.user.toString() === userId,
  );
  if (alreadyReviewed)
    throw new AppError(400, 'You have already reviewed this product');

  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    { $push: { reviews: { user: userId, rating: Number(rating), comment } } },
    { new: true },
  ).populate('reviews.user', 'fullName image');

  return updatedProduct;
};

// const getTrendingProducts = async (limit = 8) => {
//   const products = await Product.aggregate([
//     { $match: { isDeleted: { $ne: true } } },
//     {
//       $addFields: {
//         reviewCount: { $size: "$reviews" },
//         avgRating: { $avg: "$reviews.rating" },
//       },
//     },
//     { $sort: { reviewCount: -1, avgRating: -1 } },
//     { $limit: limit },
//     {
//       $lookup: {
//         from: "users",
//         localField: "host",
//         foreignField: "_id",
//         as: "host",
//         pipeline: [{ $project: { name: 1, profileImage: 1 } }],
//       },
//     },
//     { $unwind: { path: "$host", preserveNullAndEmptyArrays: true } },
//   ]);

//   return products;
// };

const getTrendingProducts = async (
  productId: string | undefined,
  categoryIds: string[],
  page = 1,
  limit = 10,
) => {
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {
    isDeleted: { $ne: true },
  };

  // productId dile current product ta bade debo
  if (productId) {
    query._id = { $ne: new Types.ObjectId(productId) };
  }

  // categoryIds dile filter korbo — na dile all products asbe
  if (categoryIds.length > 0) {
    query.category = {
      $in: categoryIds.map(id => new Types.ObjectId(id)),
    };
  }

  const total = await Product.countDocuments(query);

  const products = await Product.find(query)
    .populate('category', 'name')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  return {
    products,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getFeaturedProducts = async (limit = 5) => {
  const products = await Product.aggregate([
    { $match: { isDeleted: { $ne: true }, 'reviews.0': { $exists: true } } },
    {
      $addFields: {
        avgRating: { $avg: '$reviews.rating' },
      },
    },
    { $sort: { avgRating: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'host',
        foreignField: '_id',
        as: 'host',
        pipeline: [{ $project: { name: 1, profileImage: 1 } }],
      },
    },
    { $unwind: { path: '$host', preserveNullAndEmptyArrays: true } },
  ]);

  return products;
};

const getRelatedProducts = async (
  productId: string,
  category: string,
  limit = 6,
) => {
  return await Product.find({
    _id: { $ne: productId },
    category: { $regex: category, $options: 'i' },
    isDeleted: { $ne: true },
  })
    .populate('host', 'name profileImage')
    .limit(limit);
};

const getProductCategories = async () => {
  const categories = await Product.distinct('category', {
    isDeleted: { $ne: true },
  });
  return categories.filter(Boolean);
};

// 📊 DASHBOARD SERVICE
// 📊 SUMMARY SERVICE
export const getDashboardSummaryService = async (req: any) => {
  const adminId = req.user.id;

  const totalProducts = await Product.countDocuments({
    host: adminId,
  });

  const orders = await Order.find();

  let totalOrders = 0;
  let totalSales = 0;

  for (const order of orders) {
    let isAdminOrder = false;

    for (const item of order.items) {
      const product = await Product.findById(item.product);

      if (product && product.host.toString() === adminId) {
        isAdminOrder = true;

        totalSales += item.price * item.quantity;
      }
    }

    if (isAdminOrder) {
      totalOrders++;
    }
  }

  return {
    totalOrders,
    totalProducts,
    totalSales,
  };
};

export const getMonthlyEarningsService = async (req: any) => {
  const adminId = req.user?.id;

  const orders = await Order.find().populate(
    'items.product',
    'host price quantity',
  );

  const monthlyMap: Record<number, number> = {};

  orders.forEach((order: any) => {
    const adminItems = order.items.filter(
      (item: any) => item.product?.host?.toString() === adminId,
    );

    if (adminItems.length > 0) {
      const month = new Date(order.createdAt).getMonth() + 1;

      let total = 0;

      adminItems.forEach((item: any) => {
        total += item.price * item.quantity;
      });

      monthlyMap[month] = (monthlyMap[month] || 0) + total;
    }
  });

  return Object.keys(monthlyMap).map(m => ({
    month: Number(m),
    total: monthlyMap[Number(m)],
  }));
};

//review product api

// ── Home Dashboard ─────────────────────────────────────────────────────────────

// // ── Home Dashboard ─────────────────────────────────────────────────────────────
// const getProductDashboard = async (
//   userId: string,
//   year?: number,
//   page: number = 1,
//   limit: number = 10
// ) => {
//   const targetYear = year || new Date().getFullYear();
//   const skip = (page - 1) * limit;

//   // আমার সব product IDs
//   const myProducts = await Product.find(
//     { host: userId, isDeleted: false },
//     { _id: 1 }
//   );
//   const productIds = myProducts.map((p) => p._id);

//   // ── Total Products Count ──────────────────────────────────
//   const totalProducts = productIds.length;

//   // ── Total Sales & Earning ─────────────────────────────────
//   const totalSalesResult = await Order.aggregate([
//     {
//       $match: {
//         "items.product": { $in: productIds },
//         paymentStatus: "paid",
//         isDeleted: false,
//       },
//     },
//     { $unwind: "$items" },
//     { $match: { "items.product": { $in: productIds } } },
//     {
//       $group: {
//         _id: null,
//         totalSales: { $sum: "$items.quantity" },
//         totalEarning: {
//           $sum: { $multiply: ["$items.price", "$items.quantity"] },
//         },
//       },
//     },
//   ]);

//   const totalSales = totalSalesResult[0]?.totalSales || 0;
//   const totalEarning = totalSalesResult[0]?.totalEarning || 0;

//   // ── Monthly Earning ───────────────────────────────────────
//   const monthlyEarningRaw = await Order.aggregate([
//     {
//       $match: {
//         "items.product": { $in: productIds },
//         paymentStatus: "paid",
//         isDeleted: false,
//         createdAt: {
//           $gte: new Date(`${targetYear}-01-01`),
//           $lte: new Date(`${targetYear}-12-31`),
//         },
//       },
//     },
//     { $unwind: "$items" },
//     { $match: { "items.product": { $in: productIds } } },
//     {
//       $group: {
//         _id: { $month: "$createdAt" },
//         earning: {
//           $sum: { $multiply: ["$items.price", "$items.quantity"] },
//         },
//       },
//     },
//     { $sort: { _id: 1 } },
//   ]);

//   const monthlyEarning = Array.from({ length: 12 }, (_, i) => {
//     const found = monthlyEarningRaw.find((m) => m._id === i + 1);
//     return {
//       month: i + 1,
//       monthName: new Date(targetYear, i, 1).toLocaleString("en", {
//         month: "short",
//       }),
//       earning: found?.earning || 0,
//     };
//   });

//   // ── Recent Orders with pagination ─────────────────────────
//   const totalOrders = await Order.countDocuments({
//     "items.product": { $in: productIds },
//     isDeleted: false,
//   });

//   const recentOrders = await Order.find({
//     "items.product": { $in: productIds },
//     isDeleted: false,
//   })
//     .populate({ path: "items.product", select: "name images price" })
//     .populate("user", "fullName image email")
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .select("items subtotal total orderStatus paymentStatus createdAt");

//   return {
//     totalProducts,
//     totalSales,
//     totalEarning,
//     year: targetYear,
//     monthlyEarning,
//     recentOrders,
//     pagination: {
//       total: totalOrders,
//       page,
//       limit,
//       totalPages: Math.ceil(totalOrders / limit),
//     },
//   };
// };

const getProductDashboard = async (
  userId: string,
  year?: number,
  page: number = 1,
  limit: number = 10,
) => {
  const targetYear = year || new Date().getFullYear();
  const skip = (page - 1) * limit;

  // ✅ শুধু আমার product IDs
  const myProducts = await Product.find(
    { host: new Types.ObjectId(userId), isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  // ✅ product না থাকলে early return
  if (productIds.length === 0) {
    return {
      totalProducts: 0,
      totalSales: 0,
      totalEarning: 0,
      year: targetYear,
      monthlyEarning: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: new Date(targetYear, i, 1).toLocaleString('en', {
          month: 'short',
        }),
        earning: 0,
      })),
      recentOrders: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    };
  }

  // ── Total Products Count ──────────────────────────────────
  const totalProducts = productIds.length;

  // ── Total Sales & Earning ─────────────────────────────────
  const totalSalesResult = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.product': { $in: productIds },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
        pipeline: [
          {
            $project: {
              currency: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$product',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $group: {
        _id: '$product.currency', // ✅ simpler & safe (currency already exists)
        amount: {
          $sum: {
            $multiply: ['$items.price', '$items.quantity'],
          },
        },
        totalSales: {
          $sum: '$items.quantity',
        },
      },
    },
    {
      $project: {
        _id: 0,
        currency: { $ifNull: ['$_id', 'USD'] }, // ✅ final safety net
        amount: 1,
        totalSales: 1,
      },
    },
    {
      $sort: { currency: 1 },
    },
  ]);

  // const totalSales = totalSalesResult[0]?.totalSales || 0;
  // const totalEarning = totalSalesResult[0]?.totalEarning || 0;

  const totalEarningByCurrency = totalSalesResult.map(item => ({
    currency: item.currency,
    amount: item.amount,
  }));

  const totalSalesByCurrency = totalSalesResult.map(item => ({
    currency: item.currency,
    totalSales: item.totalSales,
  }));

  // ── Monthly Earning ───────────────────────────────────────
  // const monthlyEarningRaw = await Order.aggregate([
  //   {
  //     $match: {
  //       paymentStatus: "paid",
  //       isDeleted: false,
  //       createdAt: {
  //         $gte: new Date(`${targetYear}-01-01`),
  //         $lte: new Date(`${targetYear}-12-31T23:59:59`),
  //       },
  //     },
  //   },
  //   { $unwind: "$items" },
  //   {
  //     $match: {
  //       "items.product": { $in: productIds },
  //     },
  //   },
  //   {
  //     $group: {
  //       _id: { $month: "$createdAt" },
  //       earning: {
  //         $sum: { $multiply: ["$items.price", "$items.quantity"] },
  //       },
  //     },
  //   },
  //   { $sort: { _id: 1 } },
  // ]);

  // const monthlyEarning = Array.from({ length: 12 }, (_, i) => {
  //   const found = monthlyEarningRaw.find((m) => m._id === i + 1);
  //   return {
  //     month: i + 1,
  //     monthName: new Date(targetYear, i, 1).toLocaleString("en", {
  //       month: "short",
  //     }),
  //     earning: found?.earning || 0,
  //   };
  // });
  const monthlyEarningRaw = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
        createdAt: {
          $gte: new Date(`${targetYear}-01-01`),
          $lte: new Date(`${targetYear}-12-31T23:59:59.999Z`),
        },
      },
    },
    {
      $unwind: '$items',
    },
    {
      $match: {
        'items.product': { $in: productIds },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
        pipeline: [
          {
            $project: {
              currency: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$product',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $group: {
        _id: {
          month: { $month: '$createdAt' },
          currency: { $ifNull: ['$product.currency', 'USD'] },
        },
        price: {
          $sum: {
            $multiply: ['$items.price', '$items.quantity'],
          },
        },
      },
    },
    {
      $sort: {
        '_id.month': 1,
      },
    },
  ]);

  const monthlyEarning = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    const monthData = monthlyEarningRaw.filter(
      item => item._id.month === month,
    );

    return {
      month: new Date(targetYear, index, 1).toLocaleString('en', {
        month: 'short',
      }),
      amount: monthData.map(item => ({
        currency: item._id?.currency || 'USD',
        price: Number(item.price || 0),
      })),
    };
  });

  // ── Total Orders Count ────────────────────────────────────

  const totalOrdersResult = await Order.aggregate([
    {
      $match: {
        isDeleted: false,
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.product': { $in: productIds },
      },
    },
    {
      $group: {
        _id: '$_id',
      },
    },
    {
      $count: 'total',
    },
  ]);

  const totalOrders = totalOrdersResult[0]?.total || 0;

  // ── Recent Orders ─────────────────────────────────────────
  const recentOrders = await Order.aggregate([
    {
      $match: {
        'items.product': { $in: productIds },
        isDeleted: false,
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.product': { $in: productIds }, // ✅ শুধু আমার product এর items
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'items.product',
        pipeline: [{ $project: { name: 1, images: 1, price: 1, currency: 1 } }],
      },
    },
    { $unwind: '$items.product' },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
        pipeline: [{ $project: { fullName: 1, image: 1, email: 1 } }],
      },
    },
    {
      // ✅ সঠিক
      $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true },
    },
    {
      $group: {
        _id: '$_id',
        user: { $first: '$userInfo' },
        items: { $push: '$items' }, // ✅ শুধু আমার product এর items
        subtotal: { $first: '$subtotal' },
        total: { $first: '$total' },
        orderStatus: { $first: '$orderStatus' },
        paymentStatus: { $first: '$paymentStatus' },
        shippingAddress: { $first: '$shippingAddress' },
        oderid: { $first: '$oderid' },
        createdAt: { $first: '$createdAt' },
      },
    },
    // ✅ orderNumber add করো
    {
      $addFields: {
        orderId: '$_id',
        orderNumber: {
          $concat: [
            '#',
            {
              $toUpper: {
                $substrCP: [{ $toString: '$_id' }, 19, 5],
              },
            },
          ],
        },
      },
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  return {
    totalProducts,
    totalSales: totalSalesByCurrency,
    totalEarning: totalEarningByCurrency,
    year: targetYear,
    monthlyEarning,
    recentOrders,
    pagination: {
      total: totalOrders,
      page,
      limit,
      totalPages: Math.ceil(totalOrders / limit),
    },
  };
};

const getEarningOverview = async (
  userId: string,
  year?: number,
  page: number = 1,
  limit: number = 10,
) => {
  const targetYear = year || new Date().getFullYear();
  const skip = (page - 1) * limit;

  // ✅ ObjectId convert
  const myProducts = await Product.find(
    { host: new Types.ObjectId(userId), isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  // ✅ product না থাকলে early return
  if (productIds.length === 0) {
    return {
      totalEarning: 0,
      year: targetYear,
      monthlyEarning: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: new Date(targetYear, i, 1).toLocaleString('en', {
          month: 'short',
        }),
        earning: 0,
      })),
      recentTransactions: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    };
  }

  // ── Total Earning ─────────────────────────────────────────
  const totalResult = await Order.aggregate([
    { $match: { paymentStatus: 'paid', isDeleted: false } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    {
      $group: {
        _id: null,
        totalEarning: {
          $sum: { $multiply: ['$items.price', '$items.quantity'] },
        },
      },
    },
  ]);
  const totalEarning = totalResult[0]?.totalEarning || 0;

  // ── Monthly Earning ───────────────────────────────────────
  const monthlyRaw = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'paid',
        isDeleted: false,
        createdAt: {
          $gte: new Date(`${targetYear}-01-01`),
          $lte: new Date(`${targetYear}-12-31T23:59:59`),
        },
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    {
      $group: {
        _id: { $month: '$createdAt' },
        earning: {
          $sum: { $multiply: ['$items.price', '$items.quantity'] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const monthlyEarning = Array.from({ length: 12 }, (_, i) => {
    const found = monthlyRaw.find(m => m._id === i + 1);
    return {
      month: i + 1,
      monthName: new Date(targetYear, i, 1).toLocaleString('en', {
        month: 'short',
      }),
      earning: found?.earning || 0,
    };
  });

  // ── Total Transactions Count ──────────────────────────────
  const totalTransactionsResult = await Order.aggregate([
    { $match: { paymentStatus: 'paid', isDeleted: false } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    { $group: { _id: '$_id' } },
    { $count: 'total' },
  ]);
  const totalTransactions = totalTransactionsResult[0]?.total || 0;

  // ── Recent Transactions ───────────────────────────────────
  const recentTransactions = await Order.aggregate([
    { $match: { paymentStatus: 'paid', isDeleted: false } },
    { $unwind: '$items' },
    {
      $match: {
        'items.product': { $in: productIds },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'items.product',
        pipeline: [{ $project: { name: 1, images: 1 } }],
      },
    },
    { $unwind: '$items.product' },
    {
      $group: {
        _id: '$_id',
        orderId: { $first: '$_id' },
        items: { $push: '$items' },
        total: { $first: '$total' },
        orderStatus: { $first: '$orderStatus' },
        createdAt: { $first: '$createdAt' },
      },
    },
    // ✅ ObjectId → string → শেষের 5 char নাও
    {
      $addFields: {
        orderNumber: {
          $concat: [
            '#',
            {
              $toUpper: {
                $substrCP: [{ $toString: '$orderId' }, 19, 5],
              },
            },
          ],
        },
      },
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  return {
    totalEarning,
    year: targetYear,
    monthlyEarning,
    recentTransactions,
    pagination: {
      total: totalTransactions,
      page,
      limit,
      totalPages: Math.ceil(totalTransactions / limit),
    },
  };
};
// ── Order List with filter ────────────────────────────────────────────────────
const getMyOrders = async (
  userId: string,
  status?: string,
  page: number = 1,
  limit: number = 10,
) => {
  const skip = (page - 1) * limit;

  const myProducts = await Product.find(
    { host: userId, isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  const filter: any = {
    'items.product': { $in: productIds },
    isDeleted: false,
  };
  if (status) filter.orderStatus = status;

  const total = await Order.countDocuments(filter);

  const orders = await Order.find(filter)
    .populate({ path: 'items.product', select: 'name images price' })
    .populate('user', 'fullName image email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    orders,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// type OrderStatus =
//   | "processing"
//   | "shipped"
//   | "delivered"
//   | "cancelled";

//  const updateOrderStatus = async (
//   userId: string,
//   orderId: string,
//   orderStatus: OrderStatus
// ) => {

//   console.log("USER ID:", userId);
//   console.log("ORDER ID:", orderId);

//   // seller products
//   const myProducts = await Product.find(
//     {
//       host: userId,
//       isDeleted: false,
//     },
//     { _id: 1 }
//   );

//   console.log("MY PRODUCTS:", myProducts);

//   const productIds = myProducts.map((p) => p._id);

//   console.log("PRODUCT IDS:", productIds);

//   // find order first
//   const existingOrder = await Order.findOne({
//     _id: orderId,
//     "items.product": { $in: productIds },
//   });

//   console.log("EXISTING ORDER:", existingOrder);

//   if (!existingOrder) {
//     throw new Error("Order not found or not your product");
//   }

//   // update
//   existingOrder.orderStatus = orderStatus;

//   await existingOrder.save();

//   return existingOrder;
// };

// ── 1. Get My Products (Product List) ────────────────────────────────────────
const getMyProducts = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
) => {
  const skip = (page - 1) * limit;

  const total = await Product.countDocuments({
    host: userId,
    isDeleted: false,
  });

  const products = await Product.find({ host: userId, isDeleted: false })
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select(
      'name price images category shippingCost description discountPrice colors currency sizes discount stock isDeleted createdAt',
    );

  return {
    products,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ── 5. Get Single Product ─────────────────────────────────────────────────────
const getSingleProduct = async (userId: string, productId: string) => {
  const product = await Product.findOne({
    _id: productId,
    host: userId,
    isDeleted: false,
  }).populate('category', 'name');

  if (!product) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
  return product;
};

// ── 1. Get My Product Orders (Manage Order screen) ────────────────────────────
// GET /api/v1/products/manage-orders?status=processing&page=1&limit=10
const getManageOrders = async (
  userId: string,
  status?: string,
  page: number = 1,
  limit: number = 10,
) => {
  const skip = (page - 1) * limit;

  // আমার সব product IDs
  const myProducts = await Product.find(
    { host: userId, isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  const filter: any = {
    'items.product': { $in: productIds },
    isDeleted: false,
  };

  // status filter — All দিলে filter নেই
  if (status && status !== 'all') {
    filter.orderStatus = status;
  }

  const total = await Order.countDocuments(filter);

  const orders = await Order.find(filter)
    .populate({
      path: 'items.product',
      select: 'name images price',
    })
    .populate('user', 'fullName image phoneNumber')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select(
      'items shippingAddress subtotal shippingCost tax total orderStatus paymentStatus stripePaymentIntentId createdAt user',
    );

  return {
    orders,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

// ── 2. Get Single Order Details ───────────────────────────────────────────────
// GET /api/v1/products/manage-orders/:orderId
const getOrderDetails = async (userId: string, orderId: string) => {
  const myProducts = await Product.find(
    { host: userId, isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  const order = await Order.findOne({
    _id: orderId,
    'items.product': { $in: productIds },
    isDeleted: false,
  })
    .populate({
      path: 'items.product',
      select: 'name images price',
    })
    .populate('user', 'fullName image phoneNumber email');

  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  return order;
};

// ── 3. Update Order Status (Mark as Delivered) ────────────────────────────────
// PATCH /api/v1/products/manage-orders/:orderId/status
const updateManageOrderStatus = async (
  userId: string,
  orderId: string,
  orderStatus: string,
) => {
  const myProducts = await Product.find(
    { host: userId, isDeleted: false },
    { _id: 1 },
  );
  const productIds = myProducts.map(p => p._id);

  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      'items.product': { $in: productIds },
      isDeleted: false,
    },
    { $set: { orderStatus } },
    { new: true },
  ).populate({ path: 'items.product', select: 'name images price' });

  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
  return order;
};

const updateOrderStatus = async (
  userId: string,
  orderId: string,
  orderStatus: 'processing' | 'shipped' | 'delivered' | 'cancelled',
) => {
  // find order
  const existingOrder = await Order.findById(orderId);

  if (!existingOrder) {
    throw new Error('Order not found');
  }

  // update status
  existingOrder.orderStatus = orderStatus;

  // save
  await existingOrder.save();

  return existingOrder;
};

// const getReviewsByProduct = async (
//   productId: string,
//   page = 1,
//   limit = 10
// ) => {
//   const skip = (page - 1) * limit;

//   const product = await Product.findById(productId)
//     .populate("reviews.user", "fullName image");

//   if (!product) {
//     throw new Error("Product not found");
//   }

//   // ✅ SAFE FIX (TS error resolve)
//   const reviews = product.reviews ?? [];

//   const sorted = [...reviews].sort((a: any, b: any) => {
//     return (
//       new Date(b.createdAt ?? 0).getTime() -
//       new Date(a.createdAt ?? 0).getTime()
//     );
//   });

//   const paginated = sorted.slice(skip, skip + limit);

//   return {
//     meta: {
//       page,
//       limit,
//       total: reviews.length,
//       totalPage: Math.ceil(reviews.length / limit),
//     },
//     data: paginated,
//   };
// };

// // product.service.ts
// const getReviewsByProduct = async (
//   productId: string,
//   page = 1,
//   limit = 10,
// ) => {
//   const skip = (page - 1) * limit;

//   const product = await Product.findById(productId).populate([
//     { path: 'reviews.user', select: 'fullName image' },
//     { path: 'reviews.reply.user', select: 'fullName image', strictPopulate: false },
//   ]);

//   if (!product) {
//     throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
//   }

//   const reviews = (product.reviews ?? []) as any[];

//   // latest আগে sort
//   const sorted = [...reviews].sort(
//     (a, b) =>
//       new Date(b.createdAt ?? 0).getTime() -
//       new Date(a.createdAt ?? 0).getTime(),
//   );

//   const paginated = sorted.slice(skip, skip + limit);

//   // average rating
//   const avgRating =
//     reviews.length > 0
//       ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
//       : '0.0';

//   // rating breakdown
//   const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
//     star,
//     count: reviews.filter((r) => r.rating === star).length,
//   }));

//   return {
//     meta: {
//       page,
//       limit,
//       total: reviews.length,
//       totalPage: Math.ceil(reviews.length / limit),
//       averageRating: avgRating,
//       ratingBreakdown,
//     },
//     data: paginated,
//   };
// };

const getReviewsByProduct = async (productId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  // মডেলের ফিল্ড নেম 'reviews.replies.user' অনুযায়ী পপুলেট করা হলো
  const product = await Product.findById(productId).populate([
    { path: 'reviews.user', select: 'fullName image' },
    {
      path: 'reviews.replies.user',
      select: 'fullName image',
      strictPopulate: false,
    },
  ]);

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
  }

  const reviews = (product.reviews ?? []) as any[];

  // লেটেস্ট রিভিউ আগে দেখানোর জন্য সর্ট
  const sorted = [...reviews].sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime(),
  );

  // পেজিনেট করা হলো
  const paginated = sorted.slice(skip, skip + limit);

  // 🎯 এখানে ম্যাপিং করে 'replies' অ্যারেকে আপনার চাওয়া 'reply' অবজেক্টে রূপান্তর করা হচ্ছে
  const formattedReviews = paginated.map(review => {
    const reviewObj = review.toObject ? review.toObject() : review;

    // অ্যারের প্রথম রিপ্লাইটি নেওয়া হচ্ছে (যদি থাকে)
    const firstReply =
      reviewObj.replies && reviewObj.replies.length > 0
        ? reviewObj.replies[0]
        : null;

    // পুরানো 'replies' বাদ দিয়ে নতুন 'reply' অবজেক্ট যোগ করা হচ্ছে
    delete reviewObj.replies;

    return {
      ...reviewObj,
      reply: firstReply, // রেসপন্সে এখন সরাসরি অবজেক্ট হিসেবে আসবে
    };
  });

  return {
    data: formattedReviews,
    meta: {
      page,
      limit,
      total: reviews.length,
      totalPage: Math.ceil(reviews.length / limit),
    },
  };
};

const getProductsByHost = async (
  hostId: string,
  page: number = 1,
  limit: number = 10,
  categoryId?: string, // ✅ নতুন
) => {
  const skip = (page - 1) * limit;

  const filter: any = {
    host: hostId,
    isDeleted: false,
  };

  // ✅ categoryId দিলে filter করবে, না দিলে সব আসবে
  if (categoryId && categoryId.trim() !== '') {
    filter.category = categoryId;
  }

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate('category', 'name')
    .populate('host', 'fullName email image')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    products,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// product.service.ts
const addReviewReply = async (
  productId: string,
  reviewId: string,
  userId: string,
  comment: string,
) => {
  const product = await Product.findOneAndUpdate(
    {
      _id: productId,
      'reviews._id': reviewId,
    },
    {
      $push: {
        'reviews.$.replies': {
          user: new Types.ObjectId(userId),
          comment,
        },
      },
    },
    { new: true },
  )
    .populate('reviews.replies.user', 'name email image')
    .populate('reviews.user', 'name email image');

  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, 'Product or Review not found');
  }

  return product;
};

export const productServices = {
  getAllProductsService,
  getProductDetailsService,
  createProductService,
  updateProductService,
  deleteProductService,
  addProductReviewService,
  // extra features
  getTrendingProducts,
  getFeaturedProducts,
  getRelatedProducts,
  getProductCategories,
  getDashboardSummaryService,
  getMonthlyEarningsService,
  getReviewsByProduct,
  getProductDashboard,
  getEarningOverview,
  getMyOrders,
  updateOrderStatus,
  getMyProducts,
  getSingleProduct,
  getManageOrders,
  getOrderDetails,
  updateManageOrderStatus,
  getProductsByHost,
  addReviewReply,
};
