import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { categoryServices } from './eventcatagore.service';
import { Category } from './eventcatagore.model';
import { ICategoryFilter } from './eventcatagore.interface';


// ─── Create Category ───────────────────────────────────────────────────────────
const createCategory = catchAsync(async (req: Request, res: Response) => {
  const file = req.file as Express.Multer.File;

  const result = await categoryServices.createCategory(req.body, file);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Category created successfully',
    data: result,
  });
});












// ─── Get Single Category ───────────────────────────────────────────────────────
const getCategoryById = catchAsync(async (req: Request, res: Response) => {
  const result = await categoryServices.getCategoryById(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Category fetched successfully',
    data: result,
  });
});

// ─── Update Category ───────────────────────────────────────────────────────────
const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await categoryServices.updateCategory(req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Category updated successfully',
    data: result,
  });
});

// ─── Delete Category ───────────────────────────────────────────────────────────
const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await categoryServices.deleteCategory(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Category deleted successfully',
    data: result,
  });
});



// eventcatagore.controller.ts

const getAllCategories = catchAsync(async (req: Request, res: Response) => {
  const filters: ICategoryFilter = {
    searchTerm: req.query.searchTerm as string,
    isActive:
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
        ? false
        : undefined,
  };

  const result = await categoryServices.getAllCategories(filters, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories fetched successfully",
    data: result.data,
    meta: result.meta, // ✅ এখন TMeta এর সাথে match করবে
  });
});

const getCategoryByIdnew = catchAsync(async (req: Request, res: Response) => {
  const result = await categoryServices.getCategoryById(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Category fetched successfully",
    data: result,
  });
});



// const getEventsByCategoryId = catchAsync(async (req: Request, res: Response) => {
//   const result = await categoryServices.getEventsByCategoryId(
//     req.params.categoryId as string,
//     req.query
//   );

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "Events fetched successfully",
//     data: {
//       category: result.category, // ✅ এইটা add করো
//       events: result.data,       // ✅ data → events
//     },
//     meta: result.meta,
//   });
// });


const getEventsByCategoryId = catchAsync(async (req: Request, res: Response) => {
  const result = await categoryServices.getEventsByCategoryId(
    req.params.categoryId as string,
    req.query
  );
console.log("query.categories:",  req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Events fetched successfully",
    data: {
      categories: result.categories, // ✅ multiple categories info
      events: result.data,
    },
    meta: result.meta,
  });
});

export const categoryController = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
//   getAllCategoriesroute,
  getCategoryByIdnew,
  getEventsByCategoryId,
};
