import { TUser } from '../user/user.interface';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';

export const canAccessMerchantRole = (user: TUser): boolean => {
  if (!user) return false;

  // Admin bypass
  if (user.role === 'admin') {
    return true;
  }

  // Active subscription check (RevenueCat or local entitlement flag)
  const hasActiveSubscription =
    Boolean(user.isPremium) ||
    user.subscription?.status === 'active' ||
    user.subscription?.status === 'trialing';

  return hasActiveSubscription;
};

export const canAccessOrganizerRole = (user: TUser): boolean => {
  if (!user) return false;

  // Admin bypass
  if (user.role === 'admin') {
    return true;
  }

  // Active subscription check (RevenueCat or local entitlement flag)
  const hasActiveSubscription =
    Boolean(user.isPremium) ||
    user.subscription?.status === 'active' ||
    user.subscription?.status === 'trialing';

  return hasActiveSubscription;
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
