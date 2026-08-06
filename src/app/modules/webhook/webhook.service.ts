import axios from 'axios';
import config from '../../config';
import User from '../user/user.model';
import { PendingWebSubscription } from './PendingWebSubscription.model';

const PLAN_TO_ENTITLEMENT_MAP: Record<string, string> = {
  // Add more specific Wix Plan IDs here mapping to RevenueCat Entitlements
  organiser: 'organiser_entitlement',
  merchant: 'merchant_entitlement',
  skate_dj: 'skate_dj_entitlement',
  // You can add more mappings as needed based on Wix/Stripe specific Plan IDs
};

const mapPlanToEntitlement = (planId: string): string | null => {
  // Handle specific IDs or try to find a substring match
  const normalizedPlanId = planId.toLowerCase();
  
  if (PLAN_TO_ENTITLEMENT_MAP[normalizedPlanId]) {
    return PLAN_TO_ENTITLEMENT_MAP[normalizedPlanId];
  }
  
  // Fallback matching logic if Wix plan IDs contain the role
  for (const [key, value] of Object.entries(PLAN_TO_ENTITLEMENT_MAP)) {
    if (normalizedPlanId.includes(key)) {
      return value;
    }
  }

  return null;
};

/**
 * Grants a promotional entitlement via RevenueCat REST API
 */
export const grantRevenueCatEntitlement = async (
  appUserId: string,
  entitlementId: string,
  duration: 'monthly' | 'annual' | 'lifetime' = 'monthly'
) => {
  const url = `https://api.revenuecat.com/v1/subscribers/${appUserId}/entitlements/${entitlementId}/promotional_grant`;
  const headers = {
    Authorization: `Bearer ${config.revenuecat_secret_key}`,
    'Content-Type': 'application/json',
  };
  const body = {
    duration: duration,
  };

  try {
    const response = await axios.post(url, body, { headers });
    return response.data;
  } catch (error: any) {
    console.error(`Error granting RevenueCat entitlement to ${appUserId}:`, error?.response?.data || error.message);
    throw new Error('Failed to grant RevenueCat entitlement');
  }
};

/**
 * Revokes a promotional entitlement via RevenueCat REST API
 */
export const revokeRevenueCatEntitlement = async (
  appUserId: string,
  entitlementId: string
) => {
  const url = `https://api.revenuecat.com/v1/subscribers/${appUserId}/entitlements/${entitlementId}/revoke_promotionals`;
  const headers = {
    Authorization: `Bearer ${config.revenuecat_secret_key}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios.post(url, {}, { headers });
    return response.data;
  } catch (error: any) {
    console.error(`Error revoking RevenueCat entitlement for ${appUserId}:`, error?.response?.data || error.message);
    throw new Error('Failed to revoke RevenueCat entitlement');
  }
};

export const handleWixWebhook = async (payload: any) => {
  const { email, event_type, status, plan_id, sku, duration = 'monthly' } = payload;
  
  if (!email) {
    throw new Error('Missing email in webhook payload');
  }

  const normalizedEventType = (event_type || status || '').toUpperCase();
  const normalizedPlanId = plan_id || sku || '';

  const entitlementId = mapPlanToEntitlement(normalizedPlanId);
  
  if (!entitlementId) {
    console.warn(`No entitlement mapping found for plan_id/sku: ${normalizedPlanId}. Ignoring.`);
    return null;
  }

  // Check if user exists in the database
  const user = await User.findOne({ email: email.toLowerCase() });

  const isGrantEvent = ['PAYMENT_COMPLETED', 'SUBSCRIPTION_UPDATED', 'ACTIVE', 'CREATED', 'PAYMENT_SUCCESS'].includes(normalizedEventType);
  const isRevokeEvent = ['SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_EXPIRED', 'CANCELLED', 'EXPIRED'].includes(normalizedEventType);

  if (!user) {
    // User does not exist yet. Add or update PendingWebSubscription.
    if (isGrantEvent) {
      await PendingWebSubscription.findOneAndUpdate(
        { email: email.toLowerCase() },
        { 
          email: email.toLowerCase(),
          plan_id: normalizedPlanId,
          status: 'ACTIVE'
        },
        { upsert: true, new: true }
      );
    } else if (isRevokeEvent) {
      await PendingWebSubscription.findOneAndUpdate(
        { email: email.toLowerCase() },
        { status: 'CANCELLED' },
        { upsert: true }
      );
    }
    return null;
  }

  // User exists, so communicate with RevenueCat
  const appUserId = user._id.toString();

  if (isGrantEvent) {
    await grantRevenueCatEntitlement(appUserId, entitlementId, duration);
  } else if (isRevokeEvent) {
    await revokeRevenueCatEntitlement(appUserId, entitlementId);
  }

  return null;
};

export const webhookService = {
  handleWixWebhook,
  grantRevenueCatEntitlement,
  revokeRevenueCatEntitlement,
};
