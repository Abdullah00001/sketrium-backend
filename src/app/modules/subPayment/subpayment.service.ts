import httpStatus from 'http-status';
import { Types } from 'mongoose';
import axios from 'axios';
import AppError from '../../error/AppError';
import User from '../user/user.model';
import config from '../../config';
import { RevenueCatWebhookEvent } from '../webhook/RevenueCatWebhookEvent.model';

const PAY_PER_EVENT_PRODUCTS = [
  'organizer_pay_per_event',
  'organizer_starter_prepaid_30d',
  'organizer_starter_monthly:organizer-starter-prepaid-30d',
];

const isPayPerEventProduct = (productId?: string): boolean => {
  if (!productId) return false;
  return (
    PAY_PER_EVENT_PRODUCTS.includes(productId) ||
    productId.includes('pay_per_event') ||
    productId.includes('prepaid_30d')
  );
};

// ─── RevenueCat REST API: On-demand Live Sync ─────────────────────────────────
export const syncUserRevenueCatEntitlements = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const secretKey =
    config.revenuecat_secret_key ||
    process.env.REVENUECAT_SECRET_API_KEY ||
    process.env.REVENUECAT_SECRET_KEY;

  if (!secretKey) {
    console.warn(
      '[RevenueCat] No REVENUECAT_SECRET_API_KEY configured for live sync',
    );
    return {
      isPremium: Boolean(user.isPremium),
      status: user.subscription?.status || 'none',
      activeEntitlements: user.subscription?.activeEntitlements || [],
      startsAt: user.subscription?.startsAt,
      expiresAt: user.subscription?.expiresAt,
    };
  }

  try {
    const response = await axios.get(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      },
    );

    const subscriber = response.data?.subscriber;
    if (!subscriber) {
      return {
        isPremium: Boolean(user.isPremium),
        status: user.subscription?.status || 'none',
        activeEntitlements: user.subscription?.activeEntitlements || [],
        startsAt: user.subscription?.startsAt,
        expiresAt: user.subscription?.expiresAt,
      };
    }

    const entitlements = subscriber.entitlements || {};
    const activeEntitlements: string[] = [];
    let latestExpiry: Date | null = null;
    let latestStart: Date | null = null;
    let primaryPackage: string | undefined;
    let primaryEntitlement: string | undefined;

    const now = new Date();

    for (const [entId, entData] of Object.entries<any>(entitlements)) {
      const purchaseDate = entData.purchase_date
        ? new Date(entData.purchase_date)
        : now;
      let expiresDate: Date | null = entData.expires_date
        ? new Date(entData.expires_date)
        : null;

      // Pay per Event 30 days rule
      if (!expiresDate && isPayPerEventProduct(entData.product_identifier)) {
        expiresDate = new Date(
          purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
      }

      const isActive =
        expiresDate === null || expiresDate.getTime() > now.getTime();

      if (isActive) {
        activeEntitlements.push(entId);
        primaryPackage = entData.product_identifier || primaryPackage;
        primaryEntitlement = entId;
        if (!latestStart || purchaseDate > latestStart) {
          latestStart = purchaseDate;
        }
        if (expiresDate && (!latestExpiry || expiresDate > latestExpiry)) {
          latestExpiry = expiresDate;
        }
      }
    }

    const hasActive = activeEntitlements.length > 0;

    await User.findByIdAndUpdate(userId, {
      $set: {
        isPremium: hasActive,
        'subscription.status': hasActive ? 'active' : 'expired',
        'subscription.activeEntitlements': activeEntitlements,
        'subscription.revenueCatEntitlementId':
          primaryEntitlement || user.subscription?.revenueCatEntitlementId,
        'subscription.revenueCatPackageName':
          primaryPackage || user.subscription?.revenueCatPackageName,
        'subscription.startsAt':
          latestStart || user.subscription?.startsAt || now,
        'subscription.expiresAt': latestExpiry,
        'subscription.revenueCatOriginalAppUserId':
          subscriber.original_app_user_id || userId,
      },
    });

    let daysRemaining = 0;
    if (latestExpiry) {
      daysRemaining = Math.max(
        0,
        Math.ceil(
          (latestExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
    }

    return {
      isPremium: hasActive,
      status: hasActive ? 'active' : 'expired',
      activeEntitlements,
      startsAt: latestStart || user.subscription?.startsAt,
      expiresAt: latestExpiry,
      daysRemaining,
      revenueCatPackageName: primaryPackage,
      revenueCatEntitlementId: primaryEntitlement,
    };
  } catch (err: any) {
    console.error(
      `[RevenueCat] Live subscriber sync error for ${userId}:`,
      err.response?.data || err.message,
    );
    return {
      isPremium: Boolean(user.isPremium),
      status: user.subscription?.status || 'none',
      activeEntitlements: user.subscription?.activeEntitlements || [],
      startsAt: user.subscription?.startsAt,
      expiresAt: user.subscription?.expiresAt,
    };
  }
};

// ─── RevenueCat Webhook ──────────────────────────────────────────────────────
const handleRevenueCatWebhook = async (payload: any, authHeader?: string) => {
  // Authorization verification
  const expectedAuth =
    process.env.REVENUECAT_WEBHOOK_SECRET ||
    process.env.REVENUECAT_WEBHOOK_AUTH;

  if (expectedAuth) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader?.trim();
    if (!token || (token !== expectedAuth && authHeader !== expectedAuth)) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        'Invalid webhook authorization header',
      );
    }
  }

  const { event } = payload;
  if (!event) return { received: true };

  // Idempotency check via event.id
  if (event.id) {
    const existing = await RevenueCatWebhookEvent.findOne({
      eventId: event.id,
    });
    if (existing) {
      console.log(`[RevenueCat Webhook] Duplicate event ${event.id} ignored.`);
      return { received: true, duplicate: true };
    }
    await RevenueCatWebhookEvent.create({
      eventId: event.id,
      type: event.type,
      appUserId: event.app_user_id,
      environment: event.environment,
    });
  }

  // Handle Transfer
  if (event.type === 'TRANSFER') {
    const fromIds: string[] = event.transferred_from || [];
    const toIds: string[] = event.transferred_to || [];
    console.log(
      `[RevenueCat Webhook] Transfer event from [${fromIds}] to [${toIds}]`,
    );

    for (const toId of toIds) {
      if (Types.ObjectId.isValid(toId)) {
        await syncUserRevenueCatEntitlements(toId);
      }
    }
    for (const fromId of fromIds) {
      if (Types.ObjectId.isValid(fromId)) {
        await User.findByIdAndUpdate(fromId, {
          $set: {
            isPremium: false,
            'subscription.status': 'expired',
            'subscription.activeEntitlements': [],
          },
        });
      }
    }
    return { received: true, transfer: true };
  }

  if (!event.app_user_id) return { received: true };

  let userId = event.app_user_id;
  if (
    userId.startsWith('$RCAnonymousID') &&
    event.original_app_user_id &&
    !event.original_app_user_id.startsWith('$RCAnonymousID')
  ) {
    userId = event.original_app_user_id;
  }

  if (!Types.ObjectId.isValid(userId)) {
    console.log(`RevenueCat webhook skipped: Invalid user ID ${userId}`);
    return { received: true, skipped: true };
  }

  const type = event.type;
  const entitlementId =
    event.entitlement_id ||
    (event.entitlement_ids ? event.entitlement_ids[0] : undefined);
  const productId = event.product_id;
  const purchasedAt = event.purchased_at_ms
    ? Number(event.purchased_at_ms)
    : Date.now();
  const startsAt = new Date(purchasedAt);

  let expiresAt: Date | null = event.expiration_at_ms
    ? new Date(event.expiration_at_ms)
    : null;

  // Pay per Event 30-day rule for non-renewing purchase or missing expiration
  if (
    type === 'NON_RENEWING_PURCHASE' ||
    (!expiresAt && isPayPerEventProduct(productId)) ||
    (!expiresAt && entitlementId === 'organizer_access')
  ) {
    expiresAt = new Date(purchasedAt + 30 * 24 * 60 * 60 * 1000);
  }

  if (
    [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'UNCANCELLATION',
      'PRODUCT_CHANGE',
      'SUBSCRIPTION_EXTENDED',
      'NON_RENEWING_PURCHASE',
      'TEMPORARY_ENTITLEMENT_GRANT',
    ].includes(type)
  ) {
    const user = await User.findById(userId);
    const activeEntitlements = new Set(
      user?.subscription?.activeEntitlements || [],
    );
    if (entitlementId) {
      activeEntitlements.add(entitlementId);
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        isPremium: true,
        'subscription.status': 'active',
        'subscription.willRenew': type !== 'NON_RENEWING_PURCHASE',
        'subscription.expiresAt': expiresAt,
        'subscription.startsAt': startsAt,
        'subscription.revenueCatPackageName': productId,
        'subscription.revenueCatEntitlementId': entitlementId,
        'subscription.revenueCatOriginalAppUserId':
          event.original_app_user_id || userId,
        'subscription.environment': event.environment,
        'subscription.activeEntitlements': Array.from(activeEntitlements),
      },
    });
  } else if (type === 'CANCELLATION') {
    // Keep access until expiration_at_ms. Mark willRenew = false.
    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.status': 'cancelled',
        'subscription.willRenew': false,
      },
    });
  } else if (type === 'EXPIRATION') {
    const user = await User.findById(userId);
    const activeEntitlements = new Set(
      user?.subscription?.activeEntitlements || [],
    );
    if (entitlementId) {
      activeEntitlements.delete(entitlementId);
    }
    const hasRemaining = activeEntitlements.size > 0;

    await User.findByIdAndUpdate(userId, {
      $set: {
        isPremium: hasRemaining,
        'subscription.status': hasRemaining ? 'active' : 'expired',
        'subscription.activeEntitlements': Array.from(activeEntitlements),
      },
    });
  } else if (type === 'BILLING_ISSUE') {
    await User.findByIdAndUpdate(userId, {
      $set: {
        'subscription.billingIssue': true,
      },
    });
  }

  return { received: true };
};

const getRevenueCatSubscription = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  const subscription = user.subscription || {};

  const now = new Date();
  let daysRemaining = 0;
  if (subscription.expiresAt) {
    const expiresAt = new Date(subscription.expiresAt);
    daysRemaining = Math.max(
      0,
      Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  const activeEntitlements = [...(subscription.activeEntitlements || [])];
  if (
    subscription.revenueCatEntitlementId &&
    !activeEntitlements.includes(subscription.revenueCatEntitlementId)
  ) {
    activeEntitlements.push(subscription.revenueCatEntitlementId);
  }

  const isPremiumUser =
    Boolean(user.isPremium) ||
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    activeEntitlements.length > 0 ||
    user.role === 'ORGANIZER' ||
    user.role === 'MARCHANT';

  const computedStatus = isPremiumUser
    ? subscription.status === 'expired'
      ? 'active'
      : subscription.status || 'active'
    : subscription.status || 'none';

  return {
    isPremium: isPremiumUser,
    status: computedStatus,
    activeEntitlements,
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
    daysRemaining,
    willRenew: subscription.willRenew !== false,
    revenueCatPackageName: subscription.revenueCatPackageName,
    revenueCatEntitlementId: subscription.revenueCatEntitlementId,
  };
};

export const PaymentService = {
  syncUserRevenueCatEntitlements,
  handleRevenueCatWebhook,
  getRevenueCatSubscription,
};
