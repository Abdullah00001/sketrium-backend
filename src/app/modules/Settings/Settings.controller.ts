import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { SettingsService } from "./Settings.service";


const validTypes = ["privacy_policy", "terms_conditions", "about_us", "mission_statement", "disclaimer", "community_guidelines"];

// GET /api/v1/settings
// GET /api/v1/settings?type=privacy_policy
const getSettings = catchAsync(async (req: Request, res: Response) => {
  const type = req.query.type as string;

  const result = await SettingsService.getSettings(type);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Settings fetched successfully",
    data: result,
  });
});

// PATCH /api/v1/settings — Admin only
const upsertSettings = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user._id;
  const { type, content } = req.body;

  if (!validTypes.includes(type)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: `Invalid type. Valid: ${validTypes.join(", ")}`,
    });
  }

  const result = await SettingsService.upsertSettings(adminId, type, content);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Settings updated successfully",
    data: result,
  });
});

export const SettingsController = { getSettings, upsertSettings };