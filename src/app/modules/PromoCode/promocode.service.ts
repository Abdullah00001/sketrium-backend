

import crypto from 'crypto';
import httpStatus from 'http-status';
import { Types } from 'mongoose';
import AppError from '../../error/AppError';
import SubscriptionPlan from '../subPlan/subplan.model';
import PromoCode from './promocode.model';
import User from '../user/user.model';
import PaymentHistory from '../subPayment/subpayment.model';

// ─── Admin: Generate PromoCode ────────────────────────────────────────────────
const generatePromoCode = async (
  planId: string,
  adminId: string,
  expiresInDays?: number,
) => {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, "Subscription plan not found");
  }

  const code = "PROMO-" + crypto.randomBytes(4).toString("hex").toUpperCase();

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const result = await PromoCode.create({
    code,
    plan: new Types.ObjectId(planId),
    trialMonths: plan.trialMonths, // ✅ trialDays → trialMonths
    expiresAt,
    createdBy: new Types.ObjectId(adminId),
  });

  return result;
};
// ─── Validate PromoCode ───────────────────────────────────────────────────────



// ─── Mark PromoCode As Used (payment complete হলে call করবে) ─────────────────
const markPromoCodeAsUsed = async (promoCodeId: string, userId: string) => {
  // findOneAndUpdate দিয়ে atomic operation — race condition হবে না
  const promo = await PromoCode.findOneAndUpdate(
    {
      _id: new Types.ObjectId(promoCodeId),
      isUsed: false, // শুধু unused হলেই update হবে
      isActive: true,
    },
    {
      isUsed: true,
      usedBy: new Types.ObjectId(userId),
    },
    { new: true },
  );

  // promo null মানে already used বা exist করে না — silent fail করবো
  return promo;
};

// const validatePromoCode = async (code: string, planId: string, userId: string) => {
//   const promo = await PromoCode.findOne({ code: code.toUpperCase() });

//   if (!promo || !promo.isActive) {
//     throw new AppError(httpStatus.NOT_FOUND, 'Invalid promo code');
//   }
//   if (promo.isUsed) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Promo code already used');
//   }
//   if (promo.expiresAt && promo.expiresAt < new Date()) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Promo code has expired');
//   }
//   if (promo.plan.toString() !== planId) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Promo code is not valid for this plan');
//   }

//   // ✅ Atomic update — same time-এ দুজন use করতে পারবে না
//   const updated = await PromoCode.findOneAndUpdate(
//     { _id: promo._id, isUsed: false }, // condition
//     { isUsed: false, usedBy: new Types.ObjectId(userId) }, // update
//     { new: true }
//   ).populate('plan', 'name price trialDays interval currency');

//   if (!updated) {
//     throw new AppError(httpStatus.BAD_REQUEST, 'Promo code already used');
//   }

//   return updated;
// };




// const validatePromoCode = async (code: string, planId: string, userId: string) => {
//   const promo = await PromoCode.findOne({ code: code.toUpperCase() });

//   if (!promo || !promo.isActive)
//     throw new AppError(httpStatus.NOT_FOUND, "Invalid promo code");

//   if (promo.isUsed)
//     throw new AppError(httpStatus.BAD_REQUEST, "Promo code already used");

//   if (promo.expiresAt && promo.expiresAt < new Date())
//     throw new AppError(httpStatus.BAD_REQUEST, "Promo code has expired");

//   if (promo.plan.toString() !== planId)
//     throw new AppError(httpStatus.BAD_REQUEST, "Promo code is not valid for this plan");

//   const plan = await SubscriptionPlan.findById(planId);
//   if (!plan || !plan.isActive)
//     throw new AppError(httpStatus.NOT_FOUND, "Subscription plan not found");

//   const now = new Date();

//   // ✅ trialMonths থেকে expiresAt calculate
//   const trialMonths = plan.trialMonths ?? 1;
//   const expiresAt = new Date(now);
//   expiresAt.setMonth(expiresAt.getMonth() + trialMonths);

//   // ✅ Atomic — race condition থেকে বাঁচাবে
//   const updatedPromo = await PromoCode.findOneAndUpdate(
//     { _id: promo._id, isUsed: false },
//     { isUsed: true, usedBy: new Types.ObjectId(userId) },
//     { new: true },
//   );
//   if (!updatedPromo)
//     throw new AppError(httpStatus.BAD_REQUEST, "Promo code already used");

//   // ✅ Payment History (0 টাকা)
//   await PaymentHistory.create({
//     user: new Types.ObjectId(userId),
//     plan: new Types.ObjectId(planId),
//     promoCode: promo._id,
//     stripeSessionId: `PROMO-${promo._id}-${userId}-${Date.now()}`,
//     amount: 0,
//     currency: plan.currency ?? "usd",
//     status: "succeeded",
//     isTrial: true,
//     trialMonths,
//     paidAt: now,
//   });

//   // ✅ User subscription update
//   await User.findByIdAndUpdate(userId, {
//     subscription: {
//       plan: new Types.ObjectId(planId),
//       startsAt: now,
//       expiresAt,
//       trialEndsAt: expiresAt,
//       promoCodeUsed: promo._id,
//       status: "trialing",
//     },
//   });

//   return {
//     message: "Plan activated successfully with promo code",
//     isFree: true,
//     plan: plan.name,
//     expiresAt,
//     trialMonths,
//   };
// };







const validatePromoCode = async (code: string, planId: string, userId: string) => {
  const promo = await PromoCode.findOne({ code: code.toUpperCase() });
  if (!promo || !promo.isActive)
    throw new AppError(httpStatus.NOT_FOUND, "Invalid promo code");

  if (promo.isUsed)
    throw new AppError(httpStatus.BAD_REQUEST, "Promo code already used");

  // ── অন্য user আগে use করেছে কিনা ──────────────────────────
  if (promo.usedBy && promo.usedBy.toString() !== userId.toString())
    throw new AppError(httpStatus.BAD_REQUEST, "Promo code already used by another user");

  if (promo.expiresAt && promo.expiresAt < new Date())
    throw new AppError(httpStatus.BAD_REQUEST, "Promo code has expired");

  // ── planId optional — না দিলে promo code এর plan use করো ──
  let resolvedPlanId = planId;

  if (!resolvedPlanId) {
    resolvedPlanId = promo.plan.toString();
  } else {
    if (promo.plan.toString() !== resolvedPlanId)
      throw new AppError(httpStatus.BAD_REQUEST, "Promo code is not valid for this plan");
  }

  const plan = await SubscriptionPlan.findById(resolvedPlanId);
  if (!plan || !plan.isActive)
    throw new AppError(httpStatus.NOT_FOUND, "Subscription plan not found");

  const now = new Date();
  const trialMonths = plan.trialMonths ?? 1;
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + trialMonths);

  // ── Atomic update — race condition থেকে বাঁচাবে ────────────
  const updatedPromo = await PromoCode.findOneAndUpdate(
    { _id: promo._id, isUsed: false },
    { isUsed: true, usedBy: new Types.ObjectId(userId) },
    { new: true },
  );
  if (!updatedPromo)
    throw new AppError(httpStatus.BAD_REQUEST, "Promo code already used");

  // ── Payment History (0 টাকা) ─────────────────────────────────
  await PaymentHistory.create({
    user: new Types.ObjectId(userId),
    plan: new Types.ObjectId(resolvedPlanId),
    promoCode: promo._id,
    stripeSessionId: `PROMO-${promo._id}-${userId}-${Date.now()}`,
    amount: 0,
    currency: plan.currency ?? "usd",
    status: "succeeded",
    isTrial: true,
    trialMonths,
    paidAt: now,
  });

  // ── User subscription update ──────────────────────────────────
  await User.findByIdAndUpdate(userId, {
    subscription: {
      plan: new Types.ObjectId(resolvedPlanId),
      startsAt: now,
      expiresAt,
      trialEndsAt: expiresAt,
      promoCodeUsed: promo._id,
      status: "trialing",
    },
  });

  return {
    message: "Plan activated successfully with promo code",
    isFree: true,
    plan: plan.name,
    expiresAt,
    trialMonths,
  };
};





// ─── Admin: Get All PromoCodes ────────────────────────────────────────────────
const getAllPromoCodes = async () => {
  const result = await PromoCode.find()
    .populate('plan', 'name price')
    .populate('usedBy', 'fullName email')
    .populate('createdBy', 'fullName email');
  return result;
};

// ─── Admin: Delete PromoCode ──────────────────────────────────────────────────
const deletePromoCode = async (id: string) => {
  const result = await PromoCode.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true },
  );
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found');
  }
  return result;
};

// ─── Export ───────────────────────────────────────────────────────────────────
export const PromoCodeService = {
  generatePromoCode,
  validatePromoCode,
  markPromoCodeAsUsed,
  getAllPromoCodes,
  deletePromoCode,
};