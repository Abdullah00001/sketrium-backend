import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import User from '../modules/user/user.model';
import AppError from '../error/AppError';

import { UserRole } from '../modules/user/user.interface';

const checkSubscription = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user._id || req.user.id;

      const user = await User.findById(userId);
      if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

      const roleStr = String(user.role || '').toUpperCase();

      // Admin or organizer/merchant bypass
      if (
        user.role === 'admin' ||
        roleStr === 'ADMIN' ||
        user.role === UserRole.ORGANIZER ||
        roleStr === 'ORGANIZER' ||
        user.role === UserRole.MARCHANT ||
        roleStr === 'MARCHANT'
      ) {
        return next();
      }

      const hasActive =
        Boolean(user.isPremium) ||
        user.subscription?.status === 'active' ||
        user.subscription?.status === 'trialing' ||
        Boolean(
          user.subscription?.startsAt &&
            user.subscription?.expiresAt &&
            new Date(user.subscription.startsAt).getTime() >
              new Date(user.subscription.expiresAt).getTime()
        );

      if (!hasActive) {
        throw new AppError(
          httpStatus.PAYMENT_REQUIRED,
          'Please subscribe to access this feature',
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default checkSubscription;