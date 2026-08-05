import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { PromoCodeService } from './promocode.service';


// ─── Admin: Generate PromoCode ────────────────────────────────────────────────
const generatePromoCode = catchAsync(async (req: Request, res: Response) => {
  const adminId = req.user._id;
  const { planId, expiresInDays } = req.body;

  const result = await PromoCodeService.generatePromoCode(planId, adminId, expiresInDays);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Promo code generated successfully',
    data: result,
  });
});

// ─── User: Validate PromoCode ─────────────────────────────────────────────────
// const validatePromoCode = catchAsync(async (req: Request, res: Response) => {
//   const { code, planId } = req.body;

//   const result = await PromoCodeService.validatePromoCode(code, planId);
//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Promo code is valid',
//     data: result,
//   });
// });




const validatePromoCode = catchAsync(async (req: Request, res: Response) => {
  const { code, planId } = req.body;
  const userId = req.user._id; // ✅ userId নাও

  const result = await PromoCodeService.validatePromoCode(code, planId, userId); // ✅ pass করো

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Promo code is valid',
    data: result,
  });
});

// ─── Admin: Get All PromoCodes ────────────────────────────────────────────────
const getAllPromoCodes = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoCodeService.getAllPromoCodes();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Promo codes fetched successfully',
    data: result,
  });
});

// ─── Admin: Delete PromoCode ──────────────────────────────────────────────────
const deletePromoCode = catchAsync(async (req: Request, res: Response) => {
  const result = await PromoCodeService.deletePromoCode(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Promo code deleted successfully',
    data: result,
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────
export const PromoCodeController = {
  generatePromoCode,
  validatePromoCode,
  getAllPromoCodes,
  deletePromoCode,
};