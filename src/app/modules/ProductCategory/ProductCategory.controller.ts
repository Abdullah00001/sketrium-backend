import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";

import httpStatus from "http-status";
import { ProductCategoryService } from "./ProductCategory.service";

const createProductCategory = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ProductCategoryService.createProductCategory(req.body);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Product category created successfully",
      data: result,
    });
  }
);

const getAllProductCategories = catchAsync(
  async (req: Request, res: Response) => {
    const filters = {
      searchTerm: req.query.searchTerm as string,
      isActive:
        req.query.isActive === "true"
          ? true
          : req.query.isActive === "false"
          ? false
          : undefined,
    };

    const result = await ProductCategoryService.getAllProductCategories(
      filters,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product categories fetched successfully",
      data: result.data,
      meta: result.meta,
    });
  }
);

const getProductCategoryById = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ProductCategoryService.getProductCategoryById(
      req.params.id as string
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product category fetched successfully",
      data: result,
    });
  }
);

const updateProductCategory = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ProductCategoryService.updateProductCategory(
      req.params.id as string,
      req.body
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product category updated successfully",
      data: result,
    });
  }
);

const deleteProductCategory = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ProductCategoryService.deleteProductCategory(
      req.params.id as string
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Product category deleted successfully",
      data: result,
    });
  }
);








const getProductsByCategoryId = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ProductCategoryService.getProductsByCategoryId(
      req.params.categoryId as string,
      req.query
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Products fetched successfully",
      data: {
        categories: result.categories, // ✅ উপরে category name দেখাবে
        products: result.data,
      },
      meta: result.meta,
    });
  }
);


export const ProductCategoryController = {
  createProductCategory,
  getAllProductCategories,
  getProductCategoryById,
  updateProductCategory,
  deleteProductCategory,
  getProductsByCategoryId,
};