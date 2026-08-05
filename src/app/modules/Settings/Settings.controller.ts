import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { SettingsService } from "./Settings.service";


const validRoles = ["MARCHANT", "KAATEDJ", "ORGANIZER","USER"];
const validTypes = ["privacy_policy", "terms_conditions", "about_us", "mission_statement"];

// GET /api/v1/settings?role=MARCHANT
// GET /api/v1/settings?role=MARCHANT&type=privacy_policy
const getSettings = catchAsync(async (req: Request, res: Response) => {
  const role = req.query.role as string;
  const type = req.query.type as string;

  if (!role || !validRoles.includes(role)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: `role required. Valid: ${validRoles.join(", ")}`,
    });
  }

  const result = await SettingsService.getSettings(role, type);

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
  const { role, type, content } = req.body;

  if (!validRoles.includes(role)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: `Invalid role. Valid: ${validRoles.join(", ")}`,
    });
  }

  if (!validTypes.includes(type)) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: `Invalid type. Valid: ${validTypes.join(", ")}`,
    });
  }

  const result = await SettingsService.upsertSettings(adminId, role, type, content);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Settings updated successfully",
    data: result,
  });
});

export const SettingsController = { getSettings, upsertSettings };