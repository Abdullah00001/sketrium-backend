// import httpStatus from 'http-status'
// import PaymentHistory from './subpayment.model'
// import User from '../user/user.model'
// import AppError from '../../error/AppError'
// import { verifyAppleReceipt, verifyPlayReceipt } from '../../utils/subscription.utils'

// // ===== verifyAndSaveSubscription (Apple) =====
// const verifyAndSaveSubscription = async (
//   userId: string,
//   receiptData: string,
// ) => {
//   const user = await User.findById(userId)
//   if (!user || user.isDeleted) {
//     throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
//   }

//   const verifiedReceipt = await verifyAppleReceipt(receiptData)

//   if (!verifiedReceipt.isActive) {
//     throw new AppError(
//       httpStatus.BAD_REQUEST,
//       'No active subscription found in receipt',
//     )
//   }

//   const {
//     productId,
//     originalTransactionId,
//     latestTransactionId,
//     expirationDate,
//   } = verifiedReceipt

//   const entitlement = productId.toLowerCase().includes('pro') ? 'pro' : 'core'

//   const existingPayment = await PaymentHistory.findOne({
//     user: userId,
//     appleOriginalTransactionId: originalTransactionId,
//   })

//   if (existingPayment) {
//     await PaymentHistory.updateOne(
//       { _id: existingPayment._id },
//       {
//         productId,
//         entitlement,
//         status: 'active',
//         expiredAt: expirationDate,
//         appleLatestTransactionId: latestTransactionId,
//         appleReceiptData: receiptData,
//       },
//     )
//   } else {
//     await PaymentHistory.updateMany(
//       { user: userId, status: 'active' },
//       { status: 'cancelled' },
//     )

//     await PaymentHistory.create({
//       user: userId,
//       productId,
//       entitlement,
//       store: 'APP_STORE',
//       status: 'active',
//       expiredAt: expirationDate,
//       appleOriginalTransactionId: originalTransactionId,
//       appleLatestTransactionId: latestTransactionId,
//       appleReceiptData: receiptData,
//     })
//   }

//   await User.updateOne({ _id: userId }, { packageExpiry: expirationDate })

//   return {
//     success: true,
//     productId,
//     entitlement,
//     expiredAt: expirationDate,
//     isProUser: entitlement === 'pro',
//   }
// }

// // ===== verifyAndSavePlaySubscription (Google Play) =====
// const verifyAndSavePlaySubscription = async (
//   userId: string,
//   payload: { productId: string; purchaseToken: string },
// ) => {
//   const user = await User.findById(userId)
//   if (!user || user.isDeleted) {
//     throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
//   }

//   const { productId, purchaseToken } = payload
//   const receipt = await verifyPlayReceipt(
//     'com.fototidy.fotoTidy',
//     productId,
//     purchaseToken,
//   )

//   const expiredAt = receipt.expiryTimeMillis
//     ? new Date(Number(receipt.expiryTimeMillis))
//     : null

//   const isActive = expiredAt ? expiredAt > new Date() : false
//   const isCancelled =
//     receipt.cancelReason !== null && receipt.cancelReason !== undefined

//   let status: 'active' | 'expired' | 'cancelled' | 'grace_period' = 'active'
//   if (isCancelled) status = 'cancelled'
//   else if (!isActive) status = 'expired'
//   else status = 'active'

//   const entitlement = productId.toLowerCase().includes('pro') ? 'pro' : 'core'

//   await PaymentHistory.updateOne(
//     { user: userId, store: 'PLAY_STORE' },
//     {
//       user: userId,
//       productId,
//       entitlement,
//       store: 'PLAY_STORE',
//       status,
//       expiredAt,
//       googlePurchaseToken: purchaseToken,
//     },
//     { upsert: true },
//   )

//   if (expiredAt && status === 'active') {
//     await User.updateOne({ _id: userId }, { packageExpiry: expiredAt })
//   }

//   return {
//     productId,
//     entitlement,
//     expiredAt,
//     status,
//     isProUser: entitlement === 'pro',
//   }
// }

// // ===== handleAppleWebhook =====
// const handleAppleWebhook = async (payload: any) => {
//   console.log('📥 Apple Webhook:', payload.notificationType)

//   const notificationType = payload.notificationType
//   const latestReceiptInfo =
//     payload.unified_receipt?.latest_receipt_info?.[0] ||
//     payload.latest_receipt_info?.[0]

//   if (!latestReceiptInfo) {
//     console.warn('No receipt info in webhook payload')
//     return { success: false }
//   }

//   const originalTransactionId = latestReceiptInfo.original_transaction_id
//   const productId = latestReceiptInfo.product_id
//   const expirationDateMs = latestReceiptInfo.expires_date_ms
//   const expirationDate = expirationDateMs
//     ? new Date(parseInt(expirationDateMs))
//     : null

//   const payment = await PaymentHistory.findOne({
//     appleOriginalTransactionId: originalTransactionId,
//   })

//   if (!payment) {
//     console.warn('PaymentHistory not found for transaction:', originalTransactionId)
//     return { success: false }
//   }

//   const userId = payment.user.toString()

//   switch (notificationType) {
//     case 'DID_RENEW':
//     case 'INITIAL_BUY':
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         {
//           status: 'active',
//           expiredAt: expirationDate,
//           appleLatestTransactionId: latestReceiptInfo.transaction_id,
//           productId,
//         },
//       )
//       await User.updateOne({ _id: userId }, { packageExpiry: expirationDate })
//       console.log(`✅ Renewed: ${productId} | Expires: ${expirationDate}`)
//       break

//     case 'DID_CHANGE_RENEWAL_PREF':
//     case 'DID_CHANGE_RENEWAL_STATUS':
//       const autoRenewStatus = payload.auto_renew_status
//       if (autoRenewStatus === '0') {
//         console.log('Auto-renewal disabled for:', originalTransactionId)
//       }
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { expiredAt: expirationDate },
//       )
//       break

//     case 'CANCEL':
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'cancelled', expiredAt: null },
//       )
//       await User.updateOne({ _id: userId }, { packageExpiry: null })
//       console.log(`❌ Cancelled: ${originalTransactionId}`)
//       break

//     case 'DID_FAIL_TO_RENEW':
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'grace_period' },
//       )
//       console.log(`⚠️ Grace period: ${originalTransactionId}`)
//       break

//     case 'EXPIRED':
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'expired', expiredAt: expirationDate },
//       )
//       await User.updateOne({ _id: userId }, { packageExpiry: null })
//       console.log(`🕐 Expired: ${originalTransactionId}`)
//       break

//     default:
//       console.log('Unhandled notification type:', notificationType)
//   }

//   return { success: true, notificationType, originalTransactionId }
// }

// // ===== handlePlayWebhook =====
// const handlePlayWebhook = async (payload: any) => {
//   console.log(
//     '📥 Play Store Webhook:',
//     payload.subscriptionNotification?.notificationType,
//   )

//   const subscriptionNotification = payload.subscriptionNotification
//   if (!subscriptionNotification) {
//     console.warn('No subscriptionNotification in webhook payload')
//     return { success: false }
//   }

//   const { notificationType, purchaseToken, subscriptionId } =
//     subscriptionNotification

//   const payment = await PaymentHistory.findOne({
//     productId: subscriptionId,
//     store: 'PLAY_STORE',
//   })

//   if (!payment) {
//     console.warn('PaymentHistory not found:', subscriptionId)
//     return { success: false }
//   }

//   const userId = payment.user.toString()

//   switch (notificationType) {
//     case 1: // SUBSCRIPTION_RECOVERED
//     case 2: // SUBSCRIPTION_RENEWED
//     case 4: {
//       // SUBSCRIPTION_PURCHASED
//       const receipt = await verifyPlayReceipt(
//         'com.fototidy.fotoTidy',
//         subscriptionId,
//         purchaseToken,
//       )
//       const expiredAt = receipt.expiryTimeMillis
//         ? new Date(Number(receipt.expiryTimeMillis))
//         : null

//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'active', expiredAt, googlePurchaseToken: purchaseToken },
//       )
//       if (expiredAt) {
//         await User.updateOne({ _id: userId }, { packageExpiry: expiredAt })
//       }
//       console.log(`✅ Active: ${subscriptionId} | Expires: ${expiredAt}`)
//       break
//     }

//     case 5: // SUBSCRIPTION_ON_HOLD
//     case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'grace_period' },
//       )
//       console.log(`⚠️ Grace period: ${subscriptionId}`)
//       break

//     case 3: // SUBSCRIPTION_CANCELED
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'cancelled', expiredAt: null },
//       )
//       await User.updateOne({ _id: userId }, { packageExpiry: null })
//       console.log(`❌ Cancelled: ${subscriptionId}`)
//       break

//     case 13: // SUBSCRIPTION_EXPIRED
//       await PaymentHistory.updateOne(
//         { _id: payment._id },
//         { status: 'expired' },
//       )
//       await User.updateOne({ _id: userId }, { packageExpiry: null })
//       console.log(`🕐 Expired: ${subscriptionId}`)
//       break

//     default:
//       console.log('Unhandled Play notification type:', notificationType)
//   }

//   return { success: true, notificationType, subscriptionId }
// }

// // ===== getSubscriptionStatus =====
// const getSubscriptionStatus = async (userId: string) => {
//   const user = await User.findById(userId)
//   if (!user || user.isDeleted) {
//     throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
//   }

//   const activePayment = await PaymentHistory.findOne({
//     user: userId,
//     status: 'active',
//   }).sort({ expiredAt: -1 })

//   const isSubscribed = !!activePayment
//   const isExpired = activePayment
//     ? activePayment.expiredAt
//       ? activePayment.expiredAt < new Date()
//       : false
//     : false

//   return {
//     isSubscribed,
//     isExpired,
//     entitlement: activePayment?.entitlement ?? null,
//     productId: activePayment?.productId ?? null,
//     store: activePayment?.store ?? null,
//     expiredAt: activePayment?.expiredAt ?? null,
//     isProUser: activePayment?.entitlement === 'pro',
//   }
// }

// export const SubscriptionService = {
//   verifyAndSaveSubscription,
//   verifyAndSavePlaySubscription,
//   handleAppleWebhook,
//   handlePlayWebhook,
//   getSubscriptionStatus,
// }