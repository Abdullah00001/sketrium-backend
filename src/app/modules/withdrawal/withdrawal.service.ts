// import mongoose from 'mongoose';
// import Stripe from 'stripe';
// import httpStatus from 'http-status';
// import AppError from '../../error/AppError';
// import { BalanceModel } from '../Balance/balance.model';
// import { WithdrawalModel } from './withdrawal.model';

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
// const MIN_WITHDRAWAL_AMOUNT = 10;

// export class WithdrawalService {
//   static async requestWithdrawal(userId: string, amount: number) {
//     if (!amount || amount < MIN_WITHDRAWAL_AMOUNT) {
//       throw new AppError(
//         httpStatus.BAD_REQUEST,
//         `Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}`,
//       );
//     }

//     // Atomic operation to deduct balance safely
//     const balance = await BalanceModel.findOneAndUpdate(
//       {
//         userId,
//         currentBalance: { $gte: amount },
//       },
//       {
//         $inc: { currentBalance: -amount },
//       },
//       { new: true },
//     );

//     if (!balance) {
//       throw new AppError(httpStatus.BAD_REQUEST, 'Insufficient balance or account not found');
//     }

//     const withdrawal = await WithdrawalModel.create({
//       driverProfileId: balance._id,
//       amount,
//       status: 'PENDING',
//     });

//     return withdrawal;
//   }

//   static async getWithdrawalHistory(userId: string) {
//     const balance = await BalanceModel.findOne({ userId });
//     if (!balance) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Balance account not found');
//     }

//     return WithdrawalModel.find({ driverProfileId: balance._id })
//       .sort({ createdAt: -1 })
//       .lean();
//   }

//   static async getWithdrawalStatus(withdrawalId: string) {
//     const withdrawal = await WithdrawalModel.findById(withdrawalId);
//     if (!withdrawal) {
//       throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal not found');
//     }
//     return withdrawal;
//   }

//   static async rejectWithdrawal(withdrawalId: string, adminId: string) {
//     const session = await mongoose.startSession();
//     try {
//       await session.startTransaction();

//       // Atomic update to prevent race conditions (Double Processing)
//       const withdrawal = await WithdrawalModel.findOneAndUpdate(
//         { _id: withdrawalId, status: 'PENDING' },
//         {
//           $set: {
//             status: 'REJECTED',
//             processedBy: adminId,
//             processedAt: new Date(),
//           },
//         },
//         { session, new: true }
//       );

//       if (!withdrawal) {
//         throw new AppError(
//           httpStatus.BAD_REQUEST,
//           'Withdrawal not found or already processed',
//         );
//       }

//       // Return funds to driver balance
//       await BalanceModel.findByIdAndUpdate(
//         withdrawal.driverProfileId,
//         { $inc: { currentBalance: withdrawal.amount } },
//         { session }
//       );

//       await session.commitTransaction();
//       return withdrawal;
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   static async approveWithdrawal(withdrawalId: string, adminId: string) {
//     // 1. Double processing protection using atomic update
//     const withdrawal = await WithdrawalModel.findOneAndUpdate(
//       { _id: withdrawalId, status: 'PENDING' },
//       { $set: { status: 'COMPLETED', processedBy: adminId, processedAt: new Date() } },
//       { new: true }
//     );

//     if (!withdrawal) {
//       throw new AppError(
//         httpStatus.BAD_REQUEST,
//         'Withdrawal not found or already processed',
//       );
//     }

//     const balance = await BalanceModel.findById(withdrawal.driverProfileId);
//     if (!balance) {
//       // Manual rollback if balance profile deleted somehow
//       await WithdrawalModel.findByIdAndUpdate(withdrawalId, { $set: { status: 'PENDING' } });
//       throw new AppError(httpStatus.NOT_FOUND, 'Balance account not found');
//     }

//     if (!balance.stripeAccountId || !balance.stripeOnboarded) {
//       // Manual rollback
//       await WithdrawalModel.findByIdAndUpdate(withdrawalId, { $set: { status: 'PENDING' } });
//       throw new AppError(httpStatus.BAD_REQUEST, 'Stripe onboarding not completed');
//     }

//     try {
//       // 2. Execute Stripe Transfer
//       const transfer = await stripe.transfers.create({
//         amount: Math.round(withdrawal.amount * 100), // Stripe works in cents
//         currency: 'usd',
//         destination: balance.stripeAccountId,
//         description: `Withdrawal ${withdrawal._id}`,
//       });

//       // 3. Save stripe transfer ID
//       withdrawal.stripeTransferId = transfer.id;
//       await withdrawal.save();

//       return withdrawal;
//     } catch (stripeError: any) {
//       // If stripe fails, rollback database status back to PENDING
//       await WithdrawalModel.findByIdAndUpdate(withdrawalId, {
//         $set: { status: 'PENDING', processedBy: null, processedAt: null }
//       });
//       throw new AppError(
//         httpStatus.INTERNAL_SERVER_ERROR,
//         `Stripe Transfer Failed: ${stripeError.message}`
//       );
//     }
//   }
// }


import Stripe from 'stripe'
import config from '../../config'
import { WithdrawalModel } from './withdrawal.model'

import httpStatus from 'http-status'
import { BalanceModel } from '../Balance/balance.model'
import AppError from '../../error/AppError'

 
const stripe = new Stripe(config.stripe.stripe_secret_key as string);

// ===== Step 1: Onboarding link =====
const createConnectOnboardingLink = async (
  userId: string,
  returnUrl: string,
  refreshUrl: string,
) => {

   console.log('createConnectOnboardingLink called', userId, returnUrl, refreshUrl) // ← add করো
  // Balance/Profile খুঁজো
  let balanceProfile = await BalanceModel.findOne({ userId })

  // না থাকলে create করো
  if (!balanceProfile) {
    balanceProfile = await BalanceModel.create({ userId })
  }

  let stripeAccountId = balanceProfile.stripeAccountId

  // Stripe account না থাকলে বানাও
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        transfers: { requested: true },
      },
    })

    stripeAccountId = account.id

    await BalanceModel.updateOne(
      { userId },
      { stripeAccountId },
    )
  }

  // Onboarding link বানাও
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return { onboardingUrl: accountLink.url }
}

// ===== Step 2: Onboarding complete হয়েছে কিনা check =====
const checkOnboardingStatus = async (userId: string) => {
  const balanceProfile = await BalanceModel.findOne({ userId })

  if (!balanceProfile || !balanceProfile.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Please complete Stripe onboarding first!',
    )
  }

  const stripeAccount = await stripe.accounts.retrieve(
    balanceProfile.stripeAccountId,
  )

  if (stripeAccount.details_submitted && !balanceProfile.stripeOnboarded) {
    await BalanceModel.updateOne({ userId }, { stripeOnboarded: true })
  }

  return {
    stripeOnboarded: stripeAccount.details_submitted,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
  }
}

// ===== Step 3: Withdrawal request =====
const requestWithdrawal = async (userId: string, amount: number) => {
  const balanceProfile = await BalanceModel.findOne({ userId })

  if (!balanceProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Balance profile not found!')
  }

  // Onboarding complete কিনা check
  if (!balanceProfile.stripeOnboarded || !balanceProfile.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Please complete Stripe onboarding first!',
    )
  }

  // Balance যথেষ্ট আছে কিনা check
  if (balanceProfile.currentBalance < amount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Insufficient balance!',
    )
  }

  // Pending withdrawal আছে কিনা check
  const pendingWithdrawal = await WithdrawalModel.findOne({
    driverProfileId: balanceProfile._id,
    status: 'PENDING',
  })

  if (pendingWithdrawal) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You already have a pending withdrawal request!',
    )
  }

  const withdrawal = await WithdrawalModel.create({
    driverProfileId: balanceProfile._id,
    amount,
    status: 'PENDING',
  })

  return withdrawal
}

// ===== Step 4: Admin approve → Stripe transfer =====
const approveWithdrawal = async (withdrawalId: string, adminId: string) => {
  const withdrawal = await WithdrawalModel.findById(withdrawalId)

  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal not found!')
  }

  if (withdrawal.status !== 'PENDING') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only pending withdrawals can be approved!',
    )
  }

  // Balance profile থেকে stripeAccountId নাও
  const balanceProfile = await BalanceModel.findById(
    withdrawal.driverProfileId,
  )

  if (!balanceProfile || !balanceProfile.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Stripe account not found for this user!',
    )
  }

  // Stripe transfer করো
  const transfer = await stripe.transfers.create({
    amount: withdrawal.amount * 100, // cents-এ
    currency: 'usd',
    destination: balanceProfile.stripeAccountId,
  })

  // Withdrawal update করো
  await WithdrawalModel.updateOne(
    { _id: withdrawalId },
    {
      status: 'COMPLETED',
      stripeTransferId: transfer.id,
      processedBy: adminId,
      processedAt: new Date(),
    },
  )

  // Balance কমাও
  await BalanceModel.updateOne(
    { _id: balanceProfile._id },
    { $inc: { currentBalance: -withdrawal.amount } },
  )

  return { success: true, transferId: transfer.id }
}

// ===== Step 5: Admin reject =====
const rejectWithdrawal = async (withdrawalId: string, adminId: string) => {
  const withdrawal = await WithdrawalModel.findById(withdrawalId)

  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal not found!')
  }

  if (withdrawal.status !== 'PENDING') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only pending withdrawals can be rejected!',
    )
  }

  await WithdrawalModel.updateOne(
    { _id: withdrawalId },
    {
      status: 'REJECTED',
      processedBy: adminId,
      processedAt: new Date(),
    },
  )

  return { success: true }
}

// ===== Withdrawal history =====
const getWithdrawalHistory = async (userId: string) => {
  const balanceProfile = await BalanceModel.findOne({ userId })

  if (!balanceProfile) {
    return []
  }

  const withdrawals = await WithdrawalModel.find({
    driverProfileId: balanceProfile._id,
  }).sort({ createdAt: -1 })

  return withdrawals
}

// ===== Withdrawal status =====
const getWithdrawalStatus = async (withdrawalId: string) => {
  const withdrawal = await WithdrawalModel.findById(withdrawalId)

  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdrawal not found!')
  }

  return withdrawal
}

export const WithdrawalService = {
  createConnectOnboardingLink,
  checkOnboardingStatus,
  requestWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalHistory,
  getWithdrawalStatus,
}