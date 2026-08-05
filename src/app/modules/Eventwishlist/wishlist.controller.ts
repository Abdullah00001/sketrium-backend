// event.wishlist.controller.ts
import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { eventWishlistService } from "./wishlist.service";



// ── Controller ────────────────────────────────────────────────────────────────
// GET /api/v1/event-wishlist?page=1&limit=10
const getEventWishlist = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
 
  const result = await eventWishlistService.getEventWishlist(
    req.user._id,
    page,
    limit
  );
 
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Event wishlist fetched",
    data: result,
  });
});


const toggleEventWishlist = catchAsync(async (req: Request, res: Response) => {
  const result = await eventWishlistService.toggleEventWishlist(
    req.user._id,
    req.params.eventId as string
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Event ${result.action === "added" ? "added to" : "removed from"} wishlist`,
    data: result.wishlist,
  });
});


const removeEventFromWishlist = catchAsync(
  async (req: Request, res: Response) => {
    const result = await eventWishlistService.removeEventFromWishlist(
      req.user._id,
      req.params.eventId as string
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Event removed from wishlist",
      data: result,
    });
  }
);


export const eventWishlistController = {
  getEventWishlist,
  toggleEventWishlist,
  removeEventFromWishlist,
};