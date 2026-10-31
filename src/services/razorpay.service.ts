import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/env';
import { IPlan } from '../models/Plan';
import { IAddonPlan } from '../models/AddonPlan';

let razorpayInstance: any = null;

// In-memory cache for Razorpay Plan IDs (planId:region -> rzpPlanId)
const razorpayPlanCache = new Map<string, string>();

export function getRazorpayClient(): any {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    return null;
  }
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpayInstance;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
}

/**
 * Converts plan interval to Razorpay subscription period
 * Razorpay supports 'daily', 'weekly', 'monthly', 'yearly'
 */
export function getRazorpayPeriod(type: string): { period: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number } {
  switch (type) {
    case 'yearly':
      return { period: 'yearly', interval: 1 };
    case '6_months':
    case 'half_yearly':
      return { period: 'monthly', interval: 6 };
    case '3_months':
    case 'quarterly':
      return { period: 'monthly', interval: 3 };
    case 'monthly':
    default:
      return { period: 'monthly', interval: 1 };
  }
}

/**
 * Maps region and price to Razorpay currency & smallest currency unit (e.g. paise or cents).
 */
export function getAmountInSmallestUnit(price: number, region: string): { amount: number; currency: string } {
  const isINR = region === 'IN_INR';
  const currency = isINR ? 'INR' : 'USD';
  const amount = Math.round(price * 100); // 100 paise or 100 cents
  return { amount, currency };
}

/**
 * Verifies one-time payment signature:
 * generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, secret)
 */
export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!config.razorpay.keySecret) return false;
  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body.toString())
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

/**
 * Verifies subscription payment signature:
 * generated_signature = hmac_sha256(razorpay_payment_id + "|" + subscription_id, secret)
 */
export function verifyRazorpaySubscriptionSignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  if (!config.razorpay.keySecret) return false;
  try {
    const body = `${paymentId}|${subscriptionId}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body.toString())
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature:
 * generated_signature = hmac_sha256(raw_body, webhook_secret)
 * Fails closed if rawBody is not a valid Buffer or non-empty string.
 */
export function verifyRazorpayWebhookSignature(rawBody: Buffer | string | undefined, signature: string): boolean {
  if (!config.razorpay.webhookSecret || !rawBody) return false;
  try {
    const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    if (payload.length === 0) return false;

    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

/**
 * Creates or fetches an auto-renewing Plan in Razorpay matching our local Plan price and interval.
 * Reuses plan ID via caching and remote query to avoid duplicate Razorpay plan creation.
 */
export async function getOrCreateRazorpayPlan(plan: IPlan, region: string): Promise<string> {
  const cacheKey = `${plan.planId}:${region}`;
  if (razorpayPlanCache.has(cacheKey)) {
    return razorpayPlanCache.get(cacheKey)!;
  }

  const rzp = getRazorpayClient();
  if (!rzp) throw new Error('Razorpay is not configured on the server');

  const priceSource = (plan as any).webPriceByRegion || (plan as any).priceByRegion || {};
  const planPrice = region === 'IN_INR' ? (priceSource.IN_INR ?? 299) : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 9.99);
  const { amount, currency } = getAmountInSmallestUnit(planPrice, region);
  const { period, interval } = getRazorpayPeriod(plan.type);

  // 1. Try to find existing plan in Razorpay
  try {
    const existingPlans = await rzp.plans.all({ count: 50 });
    if (existingPlans && Array.isArray(existingPlans.items)) {
      const match = existingPlans.items.find(
        (p: any) =>
          p.item?.amount === amount &&
          p.item?.currency === currency &&
          p.period === period &&
          p.interval === interval &&
          p.notes?.internalPlanId === plan.planId
      );
      if (match) {
        razorpayPlanCache.set(cacheKey, match.id);
        return match.id;
      }
    }
  } catch (_) {
    // If listing fails, proceed to create
  }

  // 2. Create new Razorpay Plan if not found
  const planName = `${plan.name} (${region})`;
  const created = await rzp.plans.create({
    period,
    interval,
    item: {
      name: planName,
      amount,
      currency,
      description: `Child Protect ${plan.name} - ${period}`,
    },
    notes: {
      internalPlanId: plan.planId,
      region,
    },
  });

  razorpayPlanCache.set(cacheKey, created.id);
  return created.id;
}

/**
 * Creates an auto-renewing subscription via Razorpay Subscriptions API.
 */
export async function createRazorpaySubscription(params: {
  plan: IPlan;
  region: string;
  parentUserId: string;
  notes?: Record<string, string>;
}): Promise<{ subscriptionId: string; rzpPlanId: string }> {
  const rzp = getRazorpayClient();
  if (!rzp) throw new Error('Razorpay is not configured on the server');

  const rzpPlanId = await getOrCreateRazorpayPlan(params.plan, params.region);

  const sub = await rzp.subscriptions.create({
    plan_id: rzpPlanId,
    total_count: 120, // 10 years recurring maximum limit
    quantity: 1,
    customer_notify: 1,
    notes: {
      parentUserId: params.parentUserId,
      planId: params.plan.planId,
      region: params.region,
      ...(params.notes || {}),
    },
  });

  return {
    subscriptionId: sub.id,
    rzpPlanId,
  };
}

/**
 * Creates a one-time Razorpay Order (for one-time manual plans or add-on boosters).
 */
export async function createRazorpayOrder(params: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ orderId: string; amount: number; currency: string }> {
  const rzp = getRazorpayClient();
  if (!rzp) throw new Error('Razorpay is not configured on the server');

  const order = await rzp.orders.create({
    amount: params.amount,
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes || {},
  });

  return {
    orderId: order.id,
    amount: params.amount,
    currency: params.currency,
  };
}

/**
 * Issues a refund for a captured Razorpay payment.
 * Used for edge-case failure recovery if entitlement cannot be applied after capture.
 */
export async function refundRazorpayPayment(paymentId: string, amount?: number, reason?: string): Promise<any> {
  const rzp = getRazorpayClient();
  if (!rzp) throw new Error('Razorpay is not configured on the server');

  const options: Record<string, any> = {
    notes: {
      reason: reason || 'Entitlement grant failure',
    },
  };
  if (amount && amount > 0) {
    options.amount = amount;
  }

  return await rzp.payments.refund(paymentId, options);
}
