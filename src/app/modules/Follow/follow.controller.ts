import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { FollowService } from "./follow.service";

// ── Controller ────────────────────────────────────────────────────────────────

// POST /api/v1/follow/:userId — follow/unfollow toggle
const toggle = catchAsync(async (req: Request, res: Response) => {
  const followerId = req.user._id;
  const followingId = req.params.userId;

  const result = await FollowService.toggleFollow(followerId, followingId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// GET /api/v1/follow/following?page=1&limit=10 — আমি কাদের follow করি
const following = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await FollowService.getFollowing(userId, page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Following list fetched successfully",
    data: result,
  });
});

// GET /api/v1/follow/followers?page=1&limit=10 — আমার followers
const followers = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user._id;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await FollowService.getFollowers(userId, page, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Followers list fetched successfully",
    data: result,
  });
});

// GET /api/v1/follow/status/:userId — follow করা আছে কিনা check
const status = catchAsync(async (req: Request, res: Response) => {
  const followerId = req.user._id;
  const followingId = req.params.userId;

  const result = await FollowService.checkFollowStatus(followerId, followingId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Follow status fetched",
    data: result,
  });
});

export const FollowController = { toggle, following, followers, status };