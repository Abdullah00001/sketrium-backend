import httpStatus from 'http-status';
import { Types } from 'mongoose';
import AppError from '../../error/AppError';
import User from '../user/user.model';

// ─── RevenueCat Webhook & API ────────────────────────────────────────────────
const handleRevenueCatWebhook = async (payload: any) => {
  const { event } = payload;
  if (!event || !event.app_user_id) return;

  // We assume app_user_id is the user's MongoDB _id
  let userId = event.app_user_id;

  // Sometimes app_user_id comes as '$RCAnonymousID:...', so maybe original_app_user_id is the real ID if they logged in later.
  if (userId.startsWith('$RCAnonymousID') && event.original_app_user_id && !event.original_app_user_id.startsWith('$RCAnonymousID')) {
     userId = event.original_app_user_id;
  }

  // Validate ObjectId
  if (!Types.ObjectId.isValid(userId)) {
    console.log(`RevenueCat webhook skipped: Invalid user ID ${userId}`);
    return;
  }

  const type = event.type;
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined;
  const startsAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : undefined;

  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE'].includes(type)) {
    await User.findByIdAndUpdate(userId, {
      isPremium: true,
      'subscription.status': 'active',
      'subscription.expiresAt': expiresAt,
      'subscription.startsAt': startsAt,
      'subscription.revenueCatPackageName': event.product_id,
      'subscription.revenueCatEntitlementId': event.entitlement_id,
      'subscription.revenueCatOriginalAppUserId': event.original_app_user_id,
    });
  } else if (type === 'EXPIRATION') {
    await User.findByIdAndUpdate(userId, {
      isPremium: false,
      'subscription.status': 'expired',
    });
  } else if (type === 'CANCELLATION') {
    // Cancellation means it will not renew, but they might still be premium until expiresAt
    await User.findByIdAndUpdate(userId, {
      'subscription.status': 'cancelled',
    });
  }
};

const getRevenueCatSubscription = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  const subscription = user.subscription || {};

  const now = new Date();
  let daysRemaining = 0;
  if (subscription.expiresAt) {
    const expiresAt = new Date(subscription.expiresAt);
    daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    isPremium: user.isPremium || false,
    status: subscription.status || 'none',
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
    daysRemaining,
    revenueCatPackageName: subscription.revenueCatPackageName,
    revenueCatEntitlementId: subscription.revenueCatEntitlementId,
  };
};

export const PaymentService = {
  handleRevenueCatWebhook,
  getRevenueCatSubscription,
};
