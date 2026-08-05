import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { ContactService } from "./contact.service";




// POST /api/v1/contact — contact form submit
const create = catchAsync(async (req: Request, res: Response) => {
  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const userId = req.user?._id;
  const result = await ContactService.createContact(req.body, ipAddress, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Contact submitted successfully",
    data: result,
  });
});

// GET /api/v1/contact — get all contacts
const getAll = catchAsync(async (req: Request, res: Response) => {
  const params = {
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 10,
    status: req.query.status as any,
  };

  const { contacts, pagination } = await ContactService.getAllContacts(params);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contacts fetched successfully",
    data: contacts,
    meta: pagination,
  });
});

// GET /api/v1/contact/stats — get contact stats
const stats = catchAsync(async (_req: Request, res: Response) => {
  const result = await ContactService.getStats();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stats fetched successfully",
    data: result,
  });
});

// GET /api/v1/contact/:id — get single contact
const getOne = catchAsync(async (req: Request, res: Response) => {
  const result = await ContactService.getContactById(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact fetched successfully",
    data: result,
  });
});

// PATCH /api/v1/contact/:id/status — update contact status
const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await ContactService.updateStatus(req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Status updated successfully",
    data: result,
  });
});

// DELETE /api/v1/contact/:id — delete contact
const remove = catchAsync(async (req: Request, res: Response) => {
  await ContactService.deleteContact(req.params.id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact deleted successfully",
    data: null,
  });
});







const sendSupportMessage = catchAsync(async (req: Request, res: Response) => {
  const result = await ContactService.sendMessageToAdmin(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message sent successfully",
    data: result,
  });
});












export const ContactController = {
  create,
  getAll,
  stats,
  getOne,
  updateStatus,
  remove,
  sendSupportMessage,
};