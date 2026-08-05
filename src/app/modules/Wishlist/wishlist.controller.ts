
// wishlist.controller.ts
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { wishlistService } from "./wishlist.service";
 
 
const getWishlist = catchAsync(async (req: Request, res: Response) => {
  const result = await wishlistService.getWishlist(req.user._id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Wishlist fetched",
    data: result,
  });
});
 
 
const toggleWishlist = catchAsync(async (req: Request, res: Response) => {
  const result = await wishlistService.toggleWishlist(
    req.user._id,
    req.params.productId as string
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Product ${result.action === "added" ? "added to" : "removed from"} wishlist`,
    data: result.wishlist,
  });
});
 
 
const removeFromWishlist = catchAsync(async (req: Request, res: Response) => {
  const result = await wishlistService.removeFromWishlist(
    req.user._id,
    req.params.productId as string
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Removed from wishlist",
    data: result,
  });
});
 
 
export const wishlistController = {
  getWishlist,
  toggleWishlist,
  removeFromWishlist,
};