import { google } from 'googleapis'
import * as appleReceiptVerify from 'node-apple-receipt-verify'
import config from '../config'

// ===== Apple one-time init =====  
appleReceiptVerify.config({
  secret: config.apple.shared_secret!,
  environment: ['production', 'sandbox'],
  verbose: false,
  extended: true,
  ignoreExpired: false,
  excludeOldTransactions: true,
})

// ===== verifyAppleReceipt =====
export const verifyAppleReceipt = async (receiptData: string) => {
  try {
    const purchases = await appleReceiptVerify.validate({
      receipt: receiptData,
    })

    if (!purchases || purchases.length === 0) {
      throw new Error('No valid purchases found')
    }

    const now = Date.now()

    const activePurchases = purchases.filter(
      (p: any) => p.expirationDate && p.expirationDate > now,
    )

    const latestPurchase =
      activePurchases.sort(
        (a: any, b: any) => b.expirationDate - a.expirationDate,
      )[0] ?? purchases[purchases.length - 1]

    return {
      productId: latestPurchase.productId,
      originalTransactionId: latestPurchase.originalTransactionId,
      latestTransactionId: latestPurchase.transactionId,
      expirationDate: latestPurchase.expirationDate
        ? new Date(latestPurchase.expirationDate)
        : null,
      isActive: latestPurchase.expirationDate
        ? latestPurchase.expirationDate > now
        : false,
      purchases,
    }
  } catch (err: any) {
    throw new Error(`Apple receipt verification failed: ${err.message}`)
  }
}

// ===== Google auth client (singleton) =====
const getGoogleAuth = () => {
  return new google.auth.GoogleAuth({
    keyFile: config.google.service_account_path, // config থেকে নাও
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })
}

// ===== verifyPlayReceipt =====
export const verifyPlayReceipt = async (
  packageName: string,
  productId: string,
  purchaseToken: string,
) => {
  try {
    const auth = getGoogleAuth()
    const androidPublisher = google.androidpublisher({ version: 'v3', auth })

    const res = await androidPublisher.purchases.subscriptions.get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    })

    const data = res.data

    // expiryTimeMillis না থাকলে null
    const expiredAt = data.expiryTimeMillis
      ? new Date(Number(data.expiryTimeMillis))
      : null

    const isActive = expiredAt ? expiredAt > new Date() : false

    const isCancelled =
      data.cancelReason !== null && data.cancelReason !== undefined

    return {
      ...data,
      expiredAt,
      isActive,
      isCancelled,
    }
  } catch (err: any) {
    throw new Error(`Play receipt verification failed: ${err.message}`)
  }
}