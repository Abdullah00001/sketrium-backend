import AppError from "../../error/AppError";
import { getPaginationOptions, paginationResult } from "../eventcatagore/eventcatagore.service";
import { Product } from "../product/product.model";
import { ProductCategory } from "./ProductCategory.model";
import  httpStatus  from 'http-status';

// Create// Create function
const createProductCategory = async (payload: any) => {
  const { name, isActive = true } = payload;

  // 👇 এখানে .setOptions({ getDeleted: true }) যুক্ত করা হয়েছে
  const existing = await ProductCategory.findOne({ name: name.trim() })
    .setOptions({ getDeleted: true });

  // ✅ deleted থাকলে restore করো (এখন এই কন্ডিশনটি ঠিকঠাক কাজ করবে!)
  if (existing && existing.isDeleted) {
    const restored = await ProductCategory.findByIdAndUpdate(
      existing._id,
      {
        isDeleted: false,
        isActive: isActive, 
      },
      { new: true }
    );
    return restored;
  }

  // ✅ active থাকলে duplicate error
  if (existing && !existing.isDeleted) {
    throw new AppError(httpStatus.CONFLICT, "Category already exists");
  }

  // ✅ নতুন create করো
  return await ProductCategory.create({ name: name.trim(), isActive });
};




// ✅ Event category র মতো same pattern
const getAllProductCategories = async (filters: any, query: any) => {
  const { page, limit, skip } = getPaginationOptions(query);
  const dbQuery: any = { isDeleted: false };

  if (filters.searchTerm) {
    dbQuery.name = { $regex: filters.searchTerm, $options: "i" };
  }
  if (filters.isActive !== undefined) {
    dbQuery.isActive = filters.isActive;
  }

  const pipeline: any[] = [
    { $match: dbQuery },
    {
      // ✅ Event এর মতো productCount যোগ করো
      $lookup: {
        from: "products",
        let: { catId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$category", "$$catId"] },
              isDeleted: false,
            },
          },
        ],
        as: "products",
      },
    },
    {
      $addFields: {
        productCount: { $size: "$products" }, // ✅ productCount
      },
    },
    { $project: { products: 0 } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const result = await ProductCategory.aggregate(pipeline);
  const data = result[0]?.data || [];
  const total = result[0]?.total[0]?.count || 0;

  return {
    data,
    meta: paginationResult(total, page, limit),
  };
};

// Get Single
const getProductCategoryById = async (id: string) => {
  const category = await ProductCategory.findById(id);
  if (!category) throw new Error("Category not found");
  return category;
};

// Update
const updateProductCategory = async (id: string, payload: any) => {
  const category = await ProductCategory.findByIdAndUpdate(id, payload, {
    new: true,
  });
  if (!category) throw new Error("Category not found");
  return category;
};

// Delete
const deleteProductCategory = async (id: string) => {
  const category = await ProductCategory.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true }
  );
  if (!category) throw new Error("Category not found");
  return category;
};





const getProductsByCategoryId = async (categoryId: string, query: any) => {
  const { page, limit, skip } = getPaginationOptions(query);

  // ✅ Multiple categoryId support
  const categoryIds = query.categories
    ? query.categories.split(",")
    : [categoryId];

  // ✅ categories exist করে কিনা চেক করো
  const categories = await ProductCategory.find({ _id: { $in: categoryIds } });
  if (!categories.length) throw new Error("Category not found");

  const filter: any = {
    category: { $in: categoryIds },
    isDeleted: false,
  };

  if (query.search) {
    filter.name = { $regex: query.search, $options: "i" };
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("host", "name profileImage")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Product.countDocuments(filter),
  ]);

  return {
    categories: categories.map((cat) => ({
      _id: cat._id,
      name: cat.name,
    })),
    data: products,
    meta: paginationResult(total, page, limit),
  };
};



export const ProductCategoryService = {
  createProductCategory,
  getAllProductCategories,
  getProductCategoryById,
  updateProductCategory,
  deleteProductCategory,
  getProductsByCategoryId,
};