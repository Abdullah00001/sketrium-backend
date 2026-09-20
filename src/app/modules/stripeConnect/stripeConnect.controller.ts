import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { stripeConnectService } from './stripeConnect.service';

const onboardMerchant = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await stripeConnectService.onboardSeller(userId, 'MARCHANT');

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Merchant onboarding account link generated successfully.',
    data: result,
  });
});

const getMerchantStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await stripeConnectService.getSellerStatus(
    userId,
    'MARCHANT',
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Merchant Stripe Connect status retrieved successfully.',
    data: result,
  });
});

const onboardOrganizer = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await stripeConnectService.onboardSeller(userId, 'ORGANIZER');

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Organizer onboarding account link generated successfully.',
    data: result,
  });
});

const getOrganizerStatus = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id || req.user._id;
  const result = await stripeConnectService.getSellerStatus(
    userId,
    'ORGANIZER',
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Organizer Stripe Connect status retrieved successfully.',
    data: result,
  });
});

const handleReturn = catchAsync(async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const redirectUrl = await stripeConnectService.handleReturn(token);
  res.redirect(redirectUrl);
});

const handleRefresh = catchAsync(async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const redirectUrl = await stripeConnectService.handleRefresh(token);
  res.redirect(redirectUrl);
});

export const StripeConnectController = {
  onboardMerchant,
  getMerchantStatus,
  onboardOrganizer,
  getOrganizerStatus,
  handleReturn,
  handleRefresh,
};
