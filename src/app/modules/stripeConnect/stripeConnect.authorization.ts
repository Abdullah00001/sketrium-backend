import { TUser, UserRole } from '../user/user.interface';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';
import { PaymentService } from '../subPayment/subpayment.service';

export const canAccessMerchantRole = (user: TUser): boolean => {
  if (!user) return false;

  const roleStr = String(user.role || '').toUpperCase();

  // Admin bypass
  if (user.role === 'admin' || roleStr === 'ADMIN') {
    return true;
  }

  // Merchant role bypass
  if (user.role === UserRole.MARCHANT || roleStr === 'MARCHANT') {
    return true;
  }

  // Connected Stripe account already exists
  if (user.merchantStripeAccountId) {
    return true;
  }

  // Active entitlements array
  const activeEntitlements = user.subscription?.activeEntitlements || [];
  if (activeEntitlements.includes('merchant_access')) {
    return true;
  }

  // Check if purchase was made more recently than stale expiration date
  const isNewerPurchaseThanExpiry =
    user.subscription?.startsAt &&
    user.subscription?.expiresAt &&
    new Date(user.subscription.startsAt).getTime() >
      new Date(user.subscription.expiresAt).getTime();

  // Active subscription check (RevenueCat or local entitlement flag)
  const hasActiveSubscription =
    Boolean(user.isPremium) ||
    user.subscription?.status === 'active' ||
    user.subscription?.status === 'trialing' ||
    Boolean(isNewerPurchaseThanExpiry) ||
    Boolean(
      user.subscription?.revenueCatEntitlementId?.toLowerCase().includes('merchant'),
    ) ||
    Boolean(
      user.subscription?.revenueCatPackageName?.toLowerCase().includes('merchant'),
    );

  return Boolean(hasActiveSubscription);
};

export const canAccessOrganizerRole = (user: TUser): boolean => {
  if (!user) return false;

  const roleStr = String(user.role || '').toUpperCase();

  // Admin bypass
  if (user.role === 'admin' || roleStr === 'ADMIN') {
    return true;
  }

  // Organizer role bypass
  if (user.role === UserRole.ORGANIZER || roleStr === 'ORGANIZER') {
    return true;
  }

  // Connected Stripe account already exists
  if (user.organizerStripeAccountId) {
    return true;
  }

  // Active entitlements array
  const activeEntitlements = user.subscription?.activeEntitlements || [];
  if (activeEntitlements.includes('organizer_access')) {
    return true;
  }

  // Check if purchase was made more recently than stale expiration date
  const isNewerPurchaseThanExpiry =
    user.subscription?.startsAt &&
    user.subscription?.expiresAt &&
    new Date(user.subscription.startsAt).getTime() >
      new Date(user.subscription.expiresAt).getTime();

  // Active subscription check (RevenueCat or local entitlement flag)
  const hasActiveSubscription =
    Boolean(user.isPremium) ||
    user.subscription?.status === 'active' ||
    user.subscription?.status === 'trialing' ||
    Boolean(isNewerPurchaseThanExpiry) ||
    Boolean(
      user.subscription?.revenueCatEntitlementId?.toLowerCase().includes('organizer'),
    ) ||
    Boolean(
      user.subscription?.revenueCatPackageName?.toLowerCase().includes('organizer'),
    );

  return Boolean(hasActiveSubscription);
};

export const assertMerchantRoleAccess = async (user: TUser): Promise<void> => {
  if (canAccessMerchantRole(user)) {
    return;
  }

  // On-demand fallback: Check RevenueCat live API before returning 402!
  try {
    const liveSync = await PaymentService.syncUserRevenueCatEntitlements(
      user._id?.toString() || user.id,
    );
    if (
      liveSync &&
      (liveSync.activeEntitlements?.includes('merchant_access') ||
        liveSync.isPremium)
    ) {
      return;
    }
  } catch (err: any) {
    console.warn(
      `[assertMerchantRoleAccess] Live sync check failed: ${err.message}`,
    );
  }

  throw new AppError(
    httpStatus.PAYMENT_REQUIRED,
    'Active subscription required to access Merchant role onboarding.',
  );
};

export const assertOrganizerRoleAccess = async (user: TUser): Promise<void> => {
  if (canAccessOrganizerRole(user)) {
    return;
  }

  // On-demand fallback: Check RevenueCat live API before returning 402!
  try {
    const liveSync = await PaymentService.syncUserRevenueCatEntitlements(
      user._id?.toString() || user.id,
    );
    if (
      liveSync &&
      (liveSync.activeEntitlements?.includes('organizer_access') ||
        liveSync.isPremium)
    ) {
      return;
    }
  } catch (err: any) {
    console.warn(
      `[assertOrganizerRoleAccess] Live sync check failed: ${err.message}`,
    );
  }

  throw new AppError(
    httpStatus.PAYMENT_REQUIRED,
    'Active subscription required to access Organizer role onboarding.',
  );
};
