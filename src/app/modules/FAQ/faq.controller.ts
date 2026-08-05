
import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { FAQService } from './faq.service';

// ১. Get All FAQs (User)
export const getAllFAQs = catchAsync(async (req: Request, res: Response) => {
  const result = await FAQService.getAllFAQsService();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'FAQs fetched successfully',
    data: result,
  });
});

// ২. Create FAQ (Admin)
export const createFAQ = catchAsync(async (req: Request, res: Response) => {
  const result = await FAQService.createFAQService(req);
  sendResponse(res, {
    statusCode: 210, 
    success: true,
    message: 'FAQ created successfully',
    data: result,
  });
});

// ৩. Update FAQ (Admin)
export const updateFAQ = catchAsync(async (req: Request, res: Response) => {
  const result = await FAQService.updateFAQService(req);

  if (!result) {
    return sendResponse(res, {
      statusCode: 404,
      success: false,
      message: 'FAQ not found',
      data: null,
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'FAQ updated successfully',
    data: result,
  });
});

// ৪. Delete FAQ (Admin)
export const deleteFAQ = catchAsync(async (req: Request, res: Response) => {
  const result = await FAQService.deleteFAQService(req);

  if (!result) {
    return sendResponse(res, {
      statusCode: 404,
      success: false,
      message: 'FAQ not found',
      data: null,
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'FAQ deleted successfully',
    data: null,
  });
});


export const FAQController = {
  getAllFAQs,
  createFAQ,
    updateFAQ,
    deleteFAQ
};