import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import SubscriptionPlan from './subplan.model';
import { TSubscriptionPlan } from './subplan.interface';


// ─── Create Plan ─────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import config from '../../config';


const stripe = new Stripe(config.stripe.stripe_secret_key as string, {
  apiVersion: '2026-03-25.dahlia',
});

export const createPlan = async (payload: any) => {
  // const isExist = await SubscriptionPlan.findOne({ name: payload.name });

  // if (isExist) {
  //   throw new Error(`${payload.name} already exists`);
  // }

  // ─── 1. Create Stripe Product ───
  const product = await stripe.products.create({
    name: payload.name,
    description: payload.description,
  });

  // ─── 2. Create Stripe Price AUTO ───
  const price = await stripe.prices.create({
    // unit_amount: payload.price * 100, // dollars → cents
     unit_amount: Math.round(payload.price * 100),
    currency: payload.currency || 'usd',
    recurring: {
      interval: payload.interval || 'month',
    },
    product: product.id,
  });

  // ─── 3. Save in DB ───
  const result = await SubscriptionPlan.create({
    ...payload,
    stripePriceId: price.id, // AUTO SAVE
  });

  return result;
};

// ─── Get All Plans ───────────────────────────────────────────────────────────
const getAllPlans = async () => {
  const result = await SubscriptionPlan.find({ isActive: true });
  return result;
};

// ─── Get Single Plan ─────────────────────────────────────────────────────────
const getPlanById = async (id: string) => {
  const result = await SubscriptionPlan.findById(id);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }
  return result;
};

// ─── Update Plan ─────────────────────────────────────────────────────────────
const updatePlan = async (id: string, payload: Partial<TSubscriptionPlan>) => {
  const result = await SubscriptionPlan.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }
  return result;
};

// ─── Delete Plan ─────────────────────────────────────────────────────────────
const deletePlan = async (id: string) => {
  const result = await SubscriptionPlan.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true },
  );
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription plan not found');
  }
  return result;
};


const getSubscriptionPlansByRole = async (role: string) => {
  const validRoles = ["ORGANIZER", "MARCHANT", "KAATEDJ"];

  if (!validRoles.includes(role)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "role must be 'ORGANIZER', 'MARCHANT' or 'KAATEDJ'"
    );
  }

  const plans = await SubscriptionPlan.find({
    role,
    isActive: true,
  }).select("-stripePriceId"); // ✅ stripePriceId hide করুন

  return plans;
};











// ─── Export ──────────────────────────────────────────────────────────────────
export const SubscriptionPlanService = {
  createPlan,
  getAllPlans,
  getPlanById,
  updatePlan,
  deletePlan,
  getSubscriptionPlansByRole,

};