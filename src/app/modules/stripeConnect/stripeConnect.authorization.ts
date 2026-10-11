import { TUser, UserRole } from '../user/user.interface';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';

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
      user.subscription?.revenueCatEntitlementId?.toLowerCase().includes('merchant')
    ) ||
    Boolean(
      user.subscription?.revenueCatPackageName?.toLowerCase().includes('merchant')
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
      user.subscription?.revenueCatEntitlementId?.toLowerCase().includes('organizer')
    ) ||
    Boolean(
      user.subscription?.revenueCatPackageName?.toLowerCase().includes('organizer')
    );

  return Boolean(hasActiveSubscription);
};

export const assertMerchantRoleAccess = (user: TUser): void => {
  if (!canAccessMerchantRole(user)) {
    throw new AppError(
      httpStatus.PAYMENT_REQUIRED,
      'Active subscription required to access Merchant role onboarding.',
    );
  }
};

export const assertOrganizerRoleAccess = (user: TUser): void => {
  if (!canAccessOrganizerRole(user)) {
    throw new AppError(
      httpStatus.PAYMENT_REQUIRED,
      'Active subscription required to access Organizer role onboarding.',
    );
  }
};
