// import { Request, Response, NextFunction } from 'express';
// import { WithdrawalService } from './withdrawal.service';



// export class WithdrawalController {
//   static async requestWithdrawal(
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) {
//     try {
//       // (req as any) ব্যবহার করে টাইপ সেফ করা হলো
//       const userId = (req as any).user?.id;
//       const result = await WithdrawalService.requestWithdrawal(
//         userId,
//         Number(req.body.amount),
//       );

//       res.status(201).json({
//         success: true,
//         data: result,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async getWithdrawalHistory(
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) {
//     try {
//       const userId = (req as any).user?.id;
//       const result = await WithdrawalService.getWithdrawalHistory(userId);

//       res.json({
//         success: true,
//         data: result,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async getWithdrawalStatus(
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) {
//     try {
//       const result = await WithdrawalService.getWithdrawalStatus(
//         req.params.withdrawalId as string,
//       );

//       res.json({
//         success: true,
//         data: result,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async approveWithdrawal(
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) {
//     try {
//       const adminId = (req as any).user?.id;
//       const result = await WithdrawalService.approveWithdrawal(
//         req.params.withdrawalId as string,
//         adminId,
//       );

//       res.json({
//         success: true,
//         message: 'Withdrawal approved successfully',
//         data: result,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   static async rejectWithdrawal(
//     req: Request,
//     res: Response,
//     next: NextFunction,
//   ) {
//     try {
//       const adminId = (req as any).user?.id;
//       const result = await WithdrawalService.rejectWithdrawal(
//         req.params.withdrawalId as string,
//         adminId,
//       );

//       res.json({
//         success: true,
//         message: 'Withdrawal rejected successfully',
//         data: result,
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
// }

import { Request, Response, NextFunction } from 'express'
import { WithdrawalService } from './withdrawal.service'

export class WithdrawalController {
  // ===== Onboarding link =====
  static async createOnboardingLink(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user?.id
      const { returnUrl, refreshUrl } = req.body

      const result = await WithdrawalService.createConnectOnboardingLink(
        userId,
        returnUrl,
        refreshUrl,
      )

      res.status(200).json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  // ===== Onboarding status =====
  static async checkOnboardingStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user?.id
      const result = await WithdrawalService.checkOnboardingStatus(userId)
      res.status(200).json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  static async requestWithdrawal(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user?.id
      const result = await WithdrawalService.requestWithdrawal(
        userId,
        Number(req.body.amount),
      )
      res.status(201).json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  static async getWithdrawalHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = (req as any).user?.id
      const result = await WithdrawalService.getWithdrawalHistory(userId)
      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  static async getWithdrawalStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await WithdrawalService.getWithdrawalStatus(
        req.params.withdrawalId as string,
      )
      res.json({ success: true, data: result })
    } catch (error) {
      next(error)
    }
  }

  static async approveWithdrawal(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const adminId = (req as any).user?.id
      const result = await WithdrawalService.approveWithdrawal(
        req.params.withdrawalId as string,
        adminId,
      )
      res.json({
        success: true,
        message: 'Withdrawal approved successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  }

  static async rejectWithdrawal(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const adminId = (req as any).user?.id
      const result = await WithdrawalService.rejectWithdrawal(
        req.params.withdrawalId as string,
        adminId,
      )
      res.json({
        success: true,
        message: 'Withdrawal rejected successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  }
}