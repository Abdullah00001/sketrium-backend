import { Request, Response } from "express";
import catchAsync from "../../../utils/catchAsync";
import { NotificationService } from "./notifications.service";
import sendResponse from "../../../utils/sendResponse";
import  httpStatus  from 'http-status';


// POST /api/v1/notifications/send
const sendCustomNotification = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user._id;
  const { title, description, targetRole } = req.body;



  const result = await NotificationService.sendCustomNotification(
    adminId,
    title,
    description,
    targetRole
  );
  console.log("this a admin id ",result )
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});



// GET /api/v1/notifications/history?page=1&limit=10
const getNotificationHistory = catchAsync(async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;

  const result = await NotificationService.getNotificationHistory(page, limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification history fetched successfully",
    data: result,
  });
});

export const NotificationController = {
  sendCustomNotification,
  getNotificationHistory,
};