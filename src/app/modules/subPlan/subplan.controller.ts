import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { SubscriptionPlanService } from './subplan.service';


// ─── Admin: Create Plan ───────────────────────────────────────────────────────
const createPlan = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPlanService.createPlan(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Subscription plan created successfully',
    data: result,
  });
});

// ─── Get All Plans ────────────────────────────────────────────────────────────
const getAllPlans = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPlanService.getAllPlans();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscription plans fetched successfully',
    data: result,
  });
});

// ─── Get Single Plan ──────────────────────────────────────────────────────────
const getPlanById = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPlanService.getPlanById(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscription plan fetched successfully',
    data: result,
  });
});

// ─── Admin: Update Plan ───────────────────────────────────────────────────────
const updatePlan = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPlanService.updatePlan(req.params.id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscription plan updated successfully',
    data: result,
  });
});

// ─── Admin: Delete Plan ───────────────────────────────────────────────────────
const deletePlan = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionPlanService.deletePlan(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscription plan deleted successfully',
    data: result,
  });
});








const getSubscriptionPlansByRole = catchAsync(async (req: Request, res: Response) => {
  const { role } = req.params;

  const result = await SubscriptionPlanService.getSubscriptionPlansByRole(role as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Subscription plans fetched successfully",
    data: result,
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────
export const SubscriptionPlanController = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  getSubscriptionPlansByRole,
};