import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import User from '../modules/user/user.model';
import AppError from '../error/AppError';

const checkSubscription = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user._id;

      const user = await User.findById(userId);
      if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

      // Admin bypass
      if (user.role === 'admin') return next();

      if (!user.isPremium) {
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