import { google, androidpublisher_v3 } from 'googleapis';
import { config } from '../config/env';

/**
 * Bidirectional Product ID mapping between Google Play Console and internal DB planId/addonId.
 *
 * PLAY CONSOLE PRICE ALIGNMENT NOTE:
 * Google Play Developer Console charges the price configured in Google Play Console (not DB).
 * The owner MUST configure each Play Console product\'s country prices in Play Console to equal
 * appPriceByRegion (INR for India, USD for all other countries).
 * DB appPriceByRegion serves as the server-side reference / SSOT for Order records and offline receipts.
 */
export const GOOGLE_PLAY_PRODUCT_MAP: Record<string, { type: 'plan' | 'addon'; internalId: string }> = {
  // One-time / Consumable Plans
  'com.parentprotect.sub.monthly': { type: 'plan', internalId: 'plan_1_month' },
  'com.parentprotect.sub.quarterly': { type: 'plan', internalId: 'plan_3_months' },
  'com.parentprotect.sub.halfyearly': { type: 'plan', internalId: 'plan_6_months' },
  'com.parentprotect.sub.yearly': { type: 'plan', internalId: 'plan_1_year' },

  'com.parentprotect.plan.monthly': { type: 'plan', internalId: 'plan_1_month' },
  'com.parentprotect.plan.quarterly': { type: 'plan', internalId: 'plan_3_months' },
  'com.parentprotect.plan.halfyearly': { type: 'plan', internalId: 'plan_6_months' },
  'com.parentprotect.plan.yearly': { type: 'plan', internalId: 'plan_1_year' },

  // Direct ID matching if Play Console uses matching planId
  'plan_1_month': { type: 'plan', internalId: 'plan_1_month' },
  'plan_3_months': { type: 'plan', internalId: 'plan_3_months' },
  'plan_6_months': { type: 'plan', internalId: 'plan_6_months' },
  'plan_1_year': { type: 'plan', internalId: 'plan_1_year' },

  // In-App One-Time Consumables (Add-on Boosters)
  'com.parentprotect.addon.storage.20gb': { type: 'addon', internalId: 'addon_storage_20gb' },
  'com.parentprotect.addon.storage.50gb': { type: 'addon', internalId: 'addon_storage_50gb' },
  'com.parentprotect.addon.live.60m': { type: 'addon', internalId: 'addon_live_60m' },
  'com.parentprotect.addon.live.180m': { type: 'addon', internalId: 'addon_live_180m' },

  // Direct ID matching for addons
  'addon_storage_20gb': { type: 'addon', internalId: 'addon_storage_20gb' },
  'addon_storage_50gb': { type: 'addon', internalId: 'addon_storage_50gb' },
  'addon_live_60m': { type: 'addon', internalId: 'addon_live_60m' },
  'addon_live_180m': { type: 'addon', internalId: 'addon_live_180m' },
};

/**
 * Resolves a Google Play productId to internal planId/addonId and type.
 */
export function mapGoogleProductIdToInternal(productId: string): { type: 'plan' | 'addon'; internalId: string } | null {
  if (!productId) return null;
  const mapped = GOOGLE_PLAY_PRODUCT_MAP[productId.trim()];
  if (mapped) return mapped;

  // Fallback: Infer type based on naming convention
  if (productId.includes('addon') || productId.includes('storage') || productId.includes('live')) {
    return { type: 'addon', internalId: productId.trim() };
  }
  return { type: 'plan', internalId: productId.trim() };
}

let publisherClient: androidpublisher_v3.Androidpublisher | null = null;

/**
 * Checks whether Google Play billing credentials are configured.
 */
export function isGooglePlayConfigured(): boolean {
  return Boolean(config.googlePlay.serviceAccountJson && config.googlePlay.serviceAccountJson.trim() !== '');
}

/**
 * Initializes and caches the Android Publisher API v3 client.
 */
function getAndroidPublisher(): androidpublisher_v3.Androidpublisher {
  if (publisherClient) return publisherClient;

  if (!isGooglePlayConfigured()) {
    throw new Error('Google Play service account JSON is not configured in environment variables');
  }

  let credentials: any;
  try {
    const raw = config.googlePlay.serviceAccountJson.trim();
    if (raw.startsWith('{')) {
      credentials = JSON.parse(raw);
    } else {
      // Base64-encoded JSON or file path
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      credentials = JSON.parse(decoded);
    }
  } catch (err: any) {
    throw new Error(`Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: ${err?.message}`);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  publisherClient = google.androidpublisher({
    version: 'v3',
    auth,
  });

  return publisherClient;
}

export interface SubscriptionVerificationResult {
  valid: boolean;
  orderId: string;
  expiryTime: Date;
  autoRenew: boolean;
  isGracePeriod: boolean;
  isExpired: boolean;
  isCanceled: boolean;
  raw?: any;
}

export interface ProductVerificationResult {
  valid: boolean;
  orderId: string;
  purchaseState: number; // 0: purchased, 1: canceled, 2: pending
  consumptionState: number; // 0: yet to be consumed, 1: consumed
  purchaseTime: Date;
  raw?: any;
}

/**
 * Verifies a Google Play subscription purchase token via Subscriptions v2 API
 * and automatically acknowledges it if pending.
 */
export async function verifySubscriptionPurchase(
  productId: string,
  purchaseToken: string
): Promise<SubscriptionVerificationResult> {
  const publisher = getAndroidPublisher();
  const packageName = config.googlePlay.packageName;

  try {
    // Call Subscriptions v2 API
    const v2Response = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });

    const subData = v2Response.data;
    if (!subData) {
      throw new Error('Empty subscription data returned from Google Play');
    }

    const state = subData.subscriptionState; // e.g. 'SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_EXPIRED'
    const lineItem = subData.lineItems && subData.lineItems.length > 0 ? subData.lineItems[0] : null;
    const expiryTimeStr = lineItem?.expiryTime;
    const expiryTime = expiryTimeStr ? new Date(expiryTimeStr) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const orderId = (subData as any).latestOrderId || (subData as any).orderId || `GPA_${Date.now()}`;
    const autoRenew = lineItem?.autoRenewingPlan !== undefined ? Boolean(lineItem.autoRenewingPlan) : true;
    const isGracePeriod = state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
    const isExpired = state === 'SUBSCRIPTION_STATE_EXPIRED' || expiryTime.getTime() < Date.now();
    const isCanceled = state === 'SUBSCRIPTION_STATE_CANCELED';
    const valid = (state === 'SUBSCRIPTION_STATE_ACTIVE' || isGracePeriod) && !isExpired;

    // Acknowledge if pending (ACKNOWLEDGEMENT_STATE_PENDING)
    if (subData.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
      await publisher.purchases.subscriptions.acknowledge({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: { developerPayload: 'acknowledged_by_child_protect_backend' },
      }).catch((ackErr) => {
        console.warn('[GooglePlay] Subscription acknowledge warning:', ackErr?.message);
      });
    }

    return {
      valid,
      orderId,
      expiryTime,
      autoRenew,
      isGracePeriod,
      isExpired,
      isCanceled,
      raw: subData,
    };
  } catch (err: any) {
    console.error('[GooglePlay] Subscription verification failed:', err?.message || err);
    return {
      valid: false,
      orderId: '',
      expiryTime: new Date(),
      autoRenew: false,
      isGracePeriod: false,
      isExpired: true,
      isCanceled: false,
      raw: err?.response?.data || err?.message,
    };
  }
}

/**
 * Verifies a Google Play in-app product purchase (for one-time consumable add-on boosters).
 * Acknowledges the purchase if unacknowledged.
 */
export async function verifyProductPurchase(
  productId: string,
  purchaseToken: string
): Promise<ProductVerificationResult> {
  const publisher = getAndroidPublisher();
  const packageName = config.googlePlay.packageName;

  try {
    const response = await publisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });

    const prod = response.data;
    const purchaseState = prod.purchaseState ?? 1; // 0: Purchased, 1: Canceled, 2: Pending
    const consumptionState = prod.consumptionState ?? 0; // 0: Yet to be consumed, 1: Consumed
    const acknowledgementState = prod.acknowledgementState ?? 0; // 0: Yet to be acknowledged, 1: Acknowledged
    const orderId = prod.orderId || `GPA_${Date.now()}`;
    const purchaseTimeMillis = parseInt(prod.purchaseTimeMillis || '0', 10);
    const purchaseTime = purchaseTimeMillis > 0 ? new Date(purchaseTimeMillis) : new Date();

    const valid = purchaseState === 0;

    // Acknowledge if valid and not acknowledged yet
    if (valid && acknowledgementState === 0) {
      await publisher.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken,
        requestBody: { developerPayload: 'acknowledged_by_child_protect_backend' },
      }).catch((ackErr) => {
        console.warn('[GooglePlay] Product acknowledge warning:', ackErr?.message);
      });
    }

    return {
      valid,
      orderId,
      purchaseState,
      consumptionState,
      purchaseTime,
      raw: prod,
    };
  } catch (err: any) {
    console.error('[GooglePlay] Product verification failed:', err?.message || err);
    return {
      valid: false,
      orderId: '',
      purchaseState: 1,
      consumptionState: 0,
      purchaseTime: new Date(),
      raw: err?.response?.data || err?.message,
    };
  }
}

/**
 * Consumes a Google Play in-app product purchase token so that the user can purchase it again.
 * Crucial for manual renewal of plans and consumable boosters.
 */
export async function consumeProductPurchase(
  productId: string,
  purchaseToken: string
): Promise<boolean> {
  const publisher = getAndroidPublisher();
  const packageName = config.googlePlay.packageName;

  try {
    await publisher.purchases.products.consume({
      packageName,
      productId,
      token: purchaseToken,
    });
    return true;
  } catch (err: any) {
    // If already consumed or error, log warning
    console.warn('[GooglePlay] Consume product purchase notice:', err?.message || err);
    return false;
  }
}
