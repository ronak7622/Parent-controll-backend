import { Request, Response } from 'express';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { Order } from '../models/Order';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { config } from '../config/env';
import {
  isRazorpayConfigured,
  createRazorpayOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
  getAmountInSmallestUnit,
  refundRazorpayPayment,
} from '../services/razorpay.service';
import {
  isGooglePlayConfigured,
  verifySubscriptionPurchase,
  verifyProductPurchase,
  consumeProductPurchase,
  mapGoogleProductIdToInternal,
} from '../services/googlePlay.service';
import { getRedisClient } from '../services/cache.service';
import { applyEntitlement, buildPlanSnapshot } from '../services/entitlement.service';

/**
 * POST /payment/razorpay/create
 * Initiates Razorpay checkout: creates a pending Order + Razorpay Subscription (plans) or Order (addons).
 */
export const createRazorpayPayment = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: 'Online payments are currently not configured on this server.',
      });
    }

    const { planId, addonId, storageAddonId, liveAddonId, region = 'HIGH_USD', allowStorageTrim = false } = req.body;

    if (!planId && !addonId) {
      return res.status(400).json({ success: false, message: 'Either planId or addonId is required' });
    }

    // ─────────────────────────────────────────────────────────────
    // 1. ADDON PAYMENT CREATION (One-time Razorpay Order)
    // ─────────────────────────────────────────────────────────────
    if (addonId) {
      const addon = await AddonPlan.findOne({ addonId, isActive: true });
      if (!addon) return res.status(404).json({ success: false, message: 'Addon plan not found' });

      const currentSub = await Subscription.findOne({ parentUserId });
      const now = new Date();
      if (!currentSub || currentSub.status === 'expired' || currentSub.status === 'grace' || currentSub.isTrial || (currentSub.expireAt && currentSub.expireAt < now)) {
        return res.status(400).json({
          success: false,
          message: 'Add-on boosters can only be added to an active paid subscription.',
        });
      }

      const receipt = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';
      const priceSource = (addon as any).webPriceByRegion || (addon as any).priceByRegion || {};
      const price = normRegion === 'IN_INR' ? (priceSource.IN_INR ?? 99) : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 3.99);
      const currency = normRegion === 'IN_INR' ? '₹' : '$';

      const { amount, currency: rzpCurrency } = getAmountInSmallestUnit(price, normRegion);
      const rzpOrder = await createRazorpayOrder({
        amount,
        currency: rzpCurrency,
        receipt,
        notes: {
          parentUserId,
          addonId: addon.addonId,
          region,
        },
      });

      // Create a 'pending' internal Order
      const internalOrder = await Order.create({
        parentUserId,
        type: addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon',
        addonId: addon.addonId,
        planLabel: addon.name,
        amount: price,
        currency,
        validityStart: currentSub.startAt || now,
        validityEnd: currentSub.expireAt,
        txnId: `txn_rzp_${rzpOrder.orderId}`,
        status: 'pending',
        paymentStatus: 'processing',
        planStatus: 'processing',
        reconcileBy: new Date(Date.now() + 15 * 60 * 1000),
        paymentProvider: 'razorpay',
        providerOrderId: rzpOrder.orderId,
        autoRenew: false,
        metadata: { region, addonType: addon.type, rzpAmount: rzpOrder.amount, hadActivePlan: true },
      });

      return res.json({
        success: true,
        type: 'addon',
        orderId: rzpOrder.orderId,
        amount: rzpOrder.amount, // in paise / cents
        currency: rzpOrder.currency,
        keyId: config.razorpay.keyId,
        internalOrderId: internalOrder._id,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. PLAN PAYMENT CREATION (One-time Razorpay Order, Manual Renewal)
    // ─────────────────────────────────────────────────────────────
    const plan = await Plan.findOne({ planId, isActive: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    // Security Gate: If plan is a test plan, verify user is in whitelist
    if ((plan as any).isTestPlan) {
      const user = await User.findById(parentUserId).lean();
      const userEmail = (user?.email || (req as any).user?.email || '').trim().toLowerCase();
      const testerEmails = config.testerEmails || [];
      if (!userEmail || !testerEmails.includes(userEmail)) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN_TEST_PLAN',
          message: 'This test plan is restricted to authorized testing accounts.',
        });
      }
    }

    // Check Single Advance Queue limit
    const currentSub = await Subscription.findOne({ parentUserId });
    const now = new Date();
    const isRealPlanActive = currentSub && currentSub.status === 'active' && !currentSub.isTrial && currentSub.expireAt > now;
    if (isRealPlanActive && currentSub?.queuedPlan && (currentSub.queuedPlan as any).planSnapshot) {
      return res.status(400).json({
        success: false,
        code: 'ADVANCE_PLAN_ALREADY_QUEUED',
        message: 'An advance plan is already queued for this account.',
      });
    }

    const { durationMs, price, currency } = await buildPlanSnapshot(plan, region);
    const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';

    // Check if user selected bundled add-ons alongside base plan
    let storageAddon: any = null;
    let storagePrice = 0;
    if (storageAddonId) {
      storageAddon = await AddonPlan.findOne({ addonId: storageAddonId, isActive: true });
      if (storageAddon) {
        const sSource = (storageAddon as any).webPriceByRegion || (storageAddon as any).priceByRegion || {};
        storagePrice = normRegion === 'IN_INR' ? (sSource.IN_INR ?? 99) : (sSource.OTHER_USD ?? sSource.HIGH_USD ?? 3.99);
      }
    }

    let liveAddon: any = null;
    let livePrice = 0;
    if (liveAddonId) {
      liveAddon = await AddonPlan.findOne({ addonId: liveAddonId, isActive: true });
      if (liveAddon) {
        const lSource = (liveAddon as any).webPriceByRegion || (liveAddon as any).priceByRegion || {};
        livePrice = normRegion === 'IN_INR' ? (lSource.IN_INR ?? 99) : (lSource.OTHER_USD ?? lSource.HIGH_USD ?? 3.99);
      }
    }

    const totalCombinedPrice = price + storagePrice + livePrice;
    const receipt = `rcpt_plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const { amount, currency: rzpCurrency } = getAmountInSmallestUnit(totalCombinedPrice, region);

    // Create a one-time Razorpay Order (MANUAL renewal / one-time purchase with bundled addons)
    const rzpOrder = await createRazorpayOrder({
      amount,
      currency: rzpCurrency,
      receipt,
      notes: {
        parentUserId,
        planId: plan.planId,
        storageAddonId: storageAddon?.addonId || '',
        liveAddonId: liveAddon?.addonId || '',
        region,
        allowStorageTrim: String(allowStorageTrim),
      },
    });

    const validityStartDt = isRealPlanActive ? currentSub.expireAt : now;
    const validityEndDt = new Date((isRealPlanActive ? currentSub.expireAt.getTime() : now.getTime()) + durationMs);

    // Create a 'pending' internal Order for the primary plan
    const internalOrder = await Order.create({
      parentUserId,
      type: 'plan',
      planId: plan.planId,
      planLabel: isRealPlanActive ? `${plan.name} (Advance Queued)` : plan.name,
      amount: price,
      currency,
      validityStart: validityStartDt,
      validityEnd: validityEndDt,
      txnId: `txn_rzp_${rzpOrder.orderId}`,
      status: 'pending',
      paymentStatus: 'processing',
      planStatus: 'processing',
      reconcileBy: new Date(Date.now() + 15 * 60 * 1000),
      paymentProvider: 'razorpay',
      providerOrderId: rzpOrder.orderId,
      autoRenew: false,
      metadata: {
        region,
        allowStorageTrim,
        rzpAmount: rzpOrder.amount,
        hadActivePlan: isRealPlanActive,
        totalCombinedPrice,
        bundledStorageAddonId: storageAddon?.addonId,
        bundledLiveAddonId: liveAddon?.addonId,
      },
    });

    // If storage addon was bundled, create its pending internal Order
    if (storageAddon) {
      await Order.create({
        parentUserId,
        type: 'storage_addon',
        addonId: storageAddon.addonId,
        planLabel: storageAddon.name,
        amount: storagePrice,
        currency,
        validityStart: validityStartDt,
        validityEnd: validityEndDt,
        txnId: `txn_rzp_${rzpOrder.orderId}_storage`,
        status: 'pending',
        paymentStatus: 'processing',
        planStatus: 'processing',
        reconcileBy: new Date(Date.now() + 15 * 60 * 1000),
        paymentProvider: 'razorpay',
        providerOrderId: rzpOrder.orderId,
        autoRenew: false,
        metadata: {
          region,
          parentTxnId: `txn_rzp_${rzpOrder.orderId}`,
          parentOrderId: internalOrder._id,
          isBundledWithPlan: true,
        },
      });
    }

    // If live minutes addon was bundled, create its pending internal Order
    if (liveAddon) {
      await Order.create({
        parentUserId,
        type: 'live_addon',
        addonId: liveAddon.addonId,
        planLabel: liveAddon.name,
        amount: livePrice,
        currency,
        validityStart: validityStartDt,
        validityEnd: validityEndDt,
        txnId: `txn_rzp_${rzpOrder.orderId}_live`,
        status: 'pending',
        paymentStatus: 'processing',
        planStatus: 'processing',
        reconcileBy: new Date(Date.now() + 15 * 60 * 1000),
        paymentProvider: 'razorpay',
        providerOrderId: rzpOrder.orderId,
        autoRenew: false,
        metadata: {
          region,
          parentTxnId: `txn_rzp_${rzpOrder.orderId}`,
          parentOrderId: internalOrder._id,
          isBundledWithPlan: true,
        },
      });
    }

    return res.json({
      success: true,
      type: 'plan',
      orderId: rzpOrder.orderId,
      amount: rzpOrder.amount, // in paise / cents
      currency: rzpOrder.currency,
      keyId: config.razorpay.keyId,
      internalOrderId: internalOrder._id,
      totalAmount: totalCombinedPrice,
    });
  } catch (err: any) {
    console.error('[Payment] Error creating Razorpay checkout:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Failed to create payment checkout' });
  }
};

/**
 * POST /payment/razorpay/verify
 * Validates cryptographic signature from Razorpay checkout modal and activates entitlement.
 */
export const verifyRazorpayPayment = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isRazorpayConfigured()) {
      return res.status(503).json({ success: false, message: 'Payments not configured' });
    }

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_subscription_id,
      razorpay_signature,
      internalOrderId,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment signature verification parameters' });
    }

    // ─────────────────────────────────────────────────────────────
    // 1. DEDUPLICATION GUARD: Guard against webhook-before-verify race
    // ─────────────────────────────────────────────────────────────
    const alreadyCompleted = await Order.findOne({
      parentUserId,
      $or: [
        { providerPaymentId: razorpay_payment_id, status: 'completed' },
        ...(razorpay_order_id ? [{ providerOrderId: razorpay_order_id, status: 'completed' }] : []),
      ],
    });

    if (alreadyCompleted) {
      const currentSub = await Subscription.findOne({ parentUserId });
      return res.json({
        success: true,
        message: 'Payment already verified and applied.',
        subscription: currentSub,
        order: alreadyCompleted,
        isQueued: false,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. SIGNATURE VERIFICATION
    // ─────────────────────────────────────────────────────────────
    let isValid = false;
    let isSubscription = false;

    if (razorpay_subscription_id) {
      isSubscription = true;
      isValid = verifyRazorpaySubscriptionSignature(razorpay_subscription_id, razorpay_payment_id, razorpay_signature);
    } else if (razorpay_order_id) {
      isValid = verifyRazorpayPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    }

    if (!isValid) {
      if (internalOrderId) {
        await Order.findByIdAndUpdate(internalOrderId, {
          $set: { status: 'failed', paymentStatus: 'failed', planStatus: 'in_active', failedAt: new Date(), failureReason: 'Invalid Razorpay signature' },
        });
      }
      return res.status(400).json({
        success: false,
        code: 'INVALID_SIGNATURE',
        message: 'Payment verification failed: invalid signature.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ORDER PROCESSING & ENTITLEMENT APPLICATION
    // ─────────────────────────────────────────────────────────────
    let order = internalOrderId
      ? await Order.findOne({ _id: internalOrderId, parentUserId })
      : await Order.findOne({
          parentUserId,
          $or: [
            ...(razorpay_subscription_id ? [{ providerSubscriptionId: razorpay_subscription_id }] : []),
            ...(razorpay_order_id ? [{ providerOrderId: razorpay_order_id }] : []),
          ],
        });

    if (order) {
      order.status = 'processing';
      order.providerPaymentId = razorpay_payment_id;
      await order.save();
    }

    // Apply Entitlement (idempotently) with refund-on-failed-grant protection
    try {
      const result = await applyEntitlement({
        parentUserId,
        type: order?.type || (isSubscription ? 'plan' : 'storage_addon'),
        planId: order?.planId,
        addonId: order?.addonId,
        region: order?.metadata?.region || 'OTHER_USD',
        platform: 'web',
        paymentProvider: 'razorpay',
        providerOrderId: razorpay_order_id,
        providerPaymentId: razorpay_payment_id,
        providerSubscriptionId: razorpay_subscription_id,
        autoRenew: isSubscription,
        allowStorageTrim: Boolean(order?.metadata?.allowStorageTrim),
        existingOrderId: order?._id?.toString(),
      });

      const planStatusVal = result.isQueued ? 'pending_to_active' : 'active';
      const activatesOnVal = result.isQueued ? (result.subscription as any)?.expireAt : undefined;
      try {
        if ((result.order as any)?._id) {
          await Order.findByIdAndUpdate((result.order as any)._id, {
            $set: {
              paymentStatus: 'paid',
              planStatus: planStatusVal,
              activatedAt: new Date(),
              ...(activatesOnVal ? { activatesOn: activatesOnVal } : {}),
            },
          });
        }
        (result.order as any).paymentStatus = 'paid';
        (result.order as any).planStatus = planStatusVal;
        if (activatesOnVal) (result.order as any).activatesOn = activatesOnVal;
      } catch {}

      // Also apply entitlement and update any linked bundled add-on orders sharing this providerOrderId
      if (razorpay_order_id) {
        try {
          const linkedAddons = await Order.find({
            parentUserId,
            providerOrderId: razorpay_order_id,
            type: { $in: ['storage_addon', 'live_addon'] },
            status: { $ne: 'completed' },
          });
          for (const addonOrd of linkedAddons) {
            try {
              await applyEntitlement({
                parentUserId,
                type: addonOrd.type,
                addonId: addonOrd.addonId,
                region: addonOrd.metadata?.region || 'IN_INR',
                platform: 'web',
                paymentProvider: 'razorpay',
                providerOrderId: razorpay_order_id,
                providerPaymentId: razorpay_payment_id,
                existingOrderId: addonOrd._id.toString(),
              });
              addonOrd.status = 'completed';
              addonOrd.paymentStatus = 'paid';
              addonOrd.planStatus = 'active';
              addonOrd.activatedAt = new Date();
              await addonOrd.save();
            } catch (aErr: any) {
              console.error('[Payment] Linked addon applyEntitlement failed:', aErr?.message);
            }
          }
        } catch (lErr: any) {
          console.error('[Payment] Error resolving linked addon orders:', lErr?.message);
        }
      }

      return res.json({
        success: true,
        message: 'Payment verified successfully and entitlement applied.',
        subscription: result.subscription,
        order: result.order,
        isQueued: result.isQueued,
        planStatus: planStatusVal,
        paymentStatus: 'paid',
        activatesOn: activatesOnVal,
      });
    } catch (grantErr: any) {
      console.error('[Payment] applyEntitlement failed after capture. Triggering refund:', grantErr?.message);
      // Auto-refund payment so user never loses money on failed grant
      try {
        await refundRazorpayPayment(razorpay_payment_id, undefined, 'Entitlement grant failure');
        if (order) {
          order.status = 'refunded';
          order.paymentStatus = 'refunded';
          order.planStatus = 'in_active';
          order.refundInfo = { amount: order.amount, startedAt: new Date(), at: new Date(), reason: 'Payment received but activation failed - auto-refund initiated', status: 'created' };
          order.failureReason = `Entitlement grant failed: ${grantErr?.message || 'Unknown error'}. Auto-refunded.`;
          await order.save();
        }
      } catch (refundErr: any) {
        console.error('[Payment] Automatic refund failed:', refundErr?.message);
      }
      return res.status(500).json({
        success: false,
        code: 'ENTITLEMENT_FAILED_REFUNDED',
        message: 'Payment was captured but activating your subscription failed. A refund has been automatically initiated.',
      });
    }
  } catch (err: any) {
    console.error('[Payment] Error verifying Razorpay payment:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Payment verification failed' });
  }
};

/**
 * POST /payment/razorpay/cancel
 * Client invokes this when user closes/cancels Razorpay checkout modal without completing payment.
 * Immediately transitions the pending order(s) to 'cancelled' so user is not shown 15m 'processing'.
 */
export const cancelRazorpayPayment = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { internalOrderId, providerOrderId } = req.body;
    if (!internalOrderId && !providerOrderId) {
      return res.status(400).json({ success: false, message: 'OrderId required to cancel' });
    }

    const query: any = { parentUserId };
    if (internalOrderId) query._id = internalOrderId;
    else if (providerOrderId) query.providerOrderId = providerOrderId;

    const primaryOrder = await Order.findOne(query);
    if (!primaryOrder) {
      return res.json({ success: true, message: 'No pending order found or already resolved' });
    }

    const targetProviderOrderId = primaryOrder.providerOrderId || providerOrderId;
    const ordersToCancel = targetProviderOrderId
      ? await Order.find({
          parentUserId,
          $or: [
            { providerOrderId: targetProviderOrderId },
            { _id: primaryOrder._id },
          ],
          paymentStatus: { $in: ['processing', 'pending'] },
        })
      : [primaryOrder];

    for (const ord of ordersToCancel) {
      ord.status = 'cancelled';
      ord.paymentStatus = 'cancelled';
      ord.planStatus = 'in_active';
      ord.failedAt = new Date();
      ord.failureReason = 'Payment was cancelled before completion. No amount was charged.';
      await ord.save();
    }

    return res.json({ success: true, message: 'Payment cancelled successfully' });
  } catch (err: any) {
    console.error('[Payment] Error cancelling Razorpay order:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Failed to cancel order' });
  }
};

/**
 * POST /payment/razorpay/webhook
 * Handles asynchronous server-to-server webhook notifications from Razorpay.
 * Idempotent, verify-signature-protected, handles order.paid, payment.captured, payment.failed.
 */
export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing webhook signature' });
    }

    // Must have rawBody captured from express.json verify hook - fail closed if missing
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.warn('[Razorpay Webhook] Raw request body missing for signature verification; rejecting.');
      return res.status(400).json({ success: false, message: 'Invalid payload verification' });
    }

    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Razorpay Webhook] Invalid webhook signature detected');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Razorpay Webhook] Received verified event: ${event}`);

    // ─────────────────────────────────────────────────────────────
    // EVENT 1: order.paid / payment.captured (Durability for Plans & Addons)
    // Guarantees entitlement even if client-side /verify network call dropped
    // ─────────────────────────────────────────────────────────────
    if (event === 'order.paid' || event === 'payment.captured') {
      const paymentEntity = payload.payment?.entity;
      const orderEntity = payload.order?.entity;

      const orderId = orderEntity?.id || paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const order = await Order.findOne({ providerOrderId: orderId });
        if (order && order.status !== 'completed') {
          console.log(`[Razorpay Webhook] Applying entitlement from webhook durability for order: ${orderId}`);
          try {
            const whResult = await applyEntitlement({
              parentUserId: order.parentUserId,
              type: order.type,
              planId: order.planId,
              addonId: order.addonId,
              region: order.metadata?.region || 'OTHER_USD',
              platform: 'web',
              paymentProvider: 'razorpay',
              providerOrderId: orderId,
              providerPaymentId: paymentId,
              autoRenew: false,
              allowStorageTrim: order.metadata?.allowStorageTrim,
              existingOrderId: order._id.toString(),
            });
            try {
              const whPlanStatus = (whResult && (whResult as any).isQueued) ? 'pending_to_active' : 'active';
              const whActivatesOn = (whResult && (whResult as any).isQueued) ? (whResult as any).subscription?.expireAt : undefined;
              order.paymentStatus = 'paid';
              order.planStatus = whPlanStatus as any;
              order.activatedAt = new Date();
              if (whActivatesOn) order.activatesOn = whActivatesOn;
              if (paymentEntity?.method) order.paymentMethod = paymentEntity.method;
              await order.save();
            } catch {}

            // Also activate any linked bundled addon orders for this providerOrderId
            try {
              const linkedAddonOrders = await Order.find({
                parentUserId: order.parentUserId,
                providerOrderId: orderId,
                type: { $in: ['storage_addon', 'live_addon'] },
                status: { $ne: 'completed' },
              });
              for (const aOrd of linkedAddonOrders) {
                try {
                  await applyEntitlement({
                    parentUserId: aOrd.parentUserId,
                    type: aOrd.type,
                    addonId: aOrd.addonId,
                    region: aOrd.metadata?.region || 'OTHER_USD',
                    platform: 'web',
                    paymentProvider: 'razorpay',
                    providerOrderId: orderId,
                    providerPaymentId: paymentId,
                    autoRenew: false,
                    existingOrderId: aOrd._id.toString(),
                  });
                  aOrd.status = 'completed';
                  aOrd.paymentStatus = 'paid';
                  aOrd.planStatus = 'active';
                  aOrd.activatedAt = new Date();
                  if (paymentEntity?.method) aOrd.paymentMethod = paymentEntity.method;
                  await aOrd.save();
                } catch (aErr: any) {
                  console.error('[Razorpay Webhook] Failed applying bundled addon entitlement:', aErr?.message);
                }
              }
            } catch (linkErr: any) {
              console.error('[Razorpay Webhook] Error processing linked addon orders:', linkErr?.message);
            }
          } catch (grantErr: any) {
            console.error('[Razorpay Webhook] applyEntitlement failed for order:', orderId, grantErr?.message);
            if (paymentId) {
              try {
                await refundRazorpayPayment(paymentId, undefined, 'Entitlement grant failure in webhook');
                order.status = 'refunded';
                order.paymentStatus = 'refunded';
                order.planStatus = 'in_active';
                order.refundInfo = { amount: order.amount, startedAt: new Date(), at: new Date(), reason: 'Payment received but activation failed - auto-refund initiated', status: 'created' };
                order.failureReason = `Webhook entitlement grant failed: ${grantErr?.message || 'Unknown error'}. Auto-refunded.`;
                await order.save();
              } catch (rfErr: any) {
                console.error('[Razorpay Webhook] Auto-refund failed:', rfErr?.message);
              }
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT 2: payment.failed
    // ─────────────────────────────────────────────────────────────
    else if (event === 'payment.failed') {
      const paymentEntity = payload.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const errorDesc = paymentEntity?.error_description || 'Payment failed';

      if (orderId) {
        await Order.updateMany(
          { providerOrderId: orderId, status: { $ne: 'completed' } },
          {
            $set: {
              status: 'failed',
              paymentStatus: 'failed',
              planStatus: 'in_active',
              failedAt: new Date(),
              failureReason: errorDesc,
            },
          }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT 3: refund.created / refund.processed
    // ─────────────────────────────────────────────────────────────
    else if (event === 'refund.created') {
      const refundEntity = payload.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;
      const refundAmt = typeof refundEntity?.amount === 'number' ? refundEntity.amount / 100 : undefined;
      if (paymentId) {
        await Order.updateOne(
          { providerPaymentId: paymentId },
          {
            $set: {
              status: 'refunded',
              paymentStatus: 'refunded',
              planStatus: 'in_active',
              'refundInfo.refundId': refundId,
              'refundInfo.amount': refundAmt,
              'refundInfo.startedAt': new Date(),
              'refundInfo.status': 'created',
              'refundInfo.reason': 'Refund initiated at gateway',
            },
          }
        );
      }
    } else if (event === 'refund.processed') {
      const refundEntity = payload.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;
      if (paymentId) {
        await Order.updateOne(
          { providerPaymentId: paymentId },
          {
            $set: {
              status: 'refunded',
              paymentStatus: 'refunded',
              planStatus: 'in_active',
              'refundInfo.refundId': refundId,
              'refundInfo.completedAt': new Date(),
              'refundInfo.status': 'processed',
            },
          }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT 4: refund.failed
    // ─────────────────────────────────────────────────────────────
    else if (event === 'refund.failed') {
      const refundEntity = payload.refund?.entity;
      const paymentId = refundEntity?.payment_id;
      const refundId = refundEntity?.id;
      const refundAmt = typeof refundEntity?.amount === 'number' ? refundEntity.amount / 100 : undefined;
      const reason = refundEntity?.notes?.reason || refundEntity?.status_reason || 'Refund failed at gateway';
      if (paymentId) {
        await Order.updateOne(
          { providerPaymentId: paymentId },
          {
            $set: {
              'refundInfo.refundId': refundId,
              'refundInfo.amount': refundAmt,
              'refundInfo.at': new Date(),
              'refundInfo.reason': reason,
              'refundInfo.status': 'failed',
              'refundInfo.expectedBy': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          }
        );
      }
    }

    return res.json({ success: true, received: true });
  } catch (err: any) {
    console.error('[Razorpay Webhook] Error processing webhook:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Webhook processing failed' });
  }
};

// ══════════════════════════════════════════════════════════════════════
// GOOGLE PLAY CONTROLLER IMPLEMENTATION
// ══════════════════════════════════════════════════════════════════════

/**
 * In-memory fallback messageId deduplication set (up to 5000 items)
 */
const processedPubsubMessages = new Set<string>();

export const verifyGooglePayment = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!isGooglePlayConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: 'Google Play billing is currently not configured on this server.',
      });
    }

    const { productId, purchaseToken, type, allowStorageTrim = false, region = 'HIGH_USD' } = req.body;

    if (!productId || !purchaseToken) {
      return res.status(400).json({
        success: false,
        message: 'Both productId and purchaseToken are required',
      });
    }

    // 1. Resolve internal product mapping
    const mapped = mapGoogleProductIdToInternal(productId);
    const resolvedType = type || mapped?.type || 'plan';
    const internalId = mapped?.internalId || productId;

    // 2. Deduplication check: check if this purchaseToken has already been applied and completed
    const existingOrder = await Order.findOne({
      parentUserId,
      providerPurchaseToken: purchaseToken,
      status: 'completed',
    });

    if (existingOrder) {
      const currentSub = await Subscription.findOne({ parentUserId });
      return res.json({
        success: true,
        message: 'Google Play purchase already verified and applied.',
        subscription: currentSub,
        order: existingOrder,
        isQueued: false,
      });
    }

    // Reuse a processing order that was recorded while this purchase was pending (if any)
    const pendingOrder = await Order.findOne({ parentUserId, providerPurchaseToken: purchaseToken });

    // 3. Verify product purchase with Google Play Developer API (purchases.products.get)
    // In manual renewal / one-time consumable model, ALL items (plans & addons) are consumable products
    const verification = await verifyProductPurchase(productId, purchaseToken);
    if (!verification.valid) {
      if (pendingOrder) {
        await Order.updateOne(
          { _id: pendingOrder._id },
          { $set: { status: 'failed', paymentStatus: 'failed', planStatus: 'in_active', failureReason: 'Google Play product verification failed' } }
        );
      }
      return res.status(400).json({
        success: false,
        code: 'INVALID_PURCHASE_TOKEN',
        message: 'Google Play product verification failed. Purchase is not valid or canceled.',
      });
    }

    // 4. Consume the product purchase so that Google Play allows re-purchasing in the future
    await consumeProductPurchase(productId, purchaseToken);

    if (resolvedType === 'addon') {
      const addon = await AddonPlan.findOne({ addonId: internalId, isActive: true });
      if (!addon) {
        return res.status(404).json({ success: false, message: `Add-on not found for productId: ${productId}` });
      }

      const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';
      // Apply addon entitlement (autoRenew: false)
      const result = await applyEntitlement({
        parentUserId,
        type: addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon',
        addonId: addon.addonId,
        region: normRegion,
        platform: 'app',
        paymentProvider: 'google_play',
        providerOrderId: verification.orderId,
        providerPurchaseToken: purchaseToken,
        autoRenew: false,
        existingOrderId: pendingOrder?._id?.toString(),
      });

      return res.json({
        success: true,
        subscription: result.subscription,
        order: result.order,
        isQueued: false,
      });
    } else {
      // One-time plan purchase (manual renewal)
      const plan = await Plan.findOne({ planId: internalId, isActive: true });
      if (!plan) {
        return res.status(404).json({ success: false, message: `Plan not found for productId: ${productId}` });
      }

      const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';
      // Apply Plan Entitlement (autoRenew: false)
      const result = await applyEntitlement({
        parentUserId,
        type: 'plan',
        planId: plan.planId,
        region: normRegion,
        platform: 'app',
        paymentProvider: 'google_play',
        providerOrderId: verification.orderId,
        providerPurchaseToken: purchaseToken,
        providerSubscriptionId: purchaseToken,
        autoRenew: false,
        allowStorageTrim,
        existingOrderId: pendingOrder?._id?.toString(),
      });

      return res.json({
        success: true,
        subscription: result.subscription,
        order: result.order,
        isQueued: result.isQueued,
      });
    }
  } catch (err: any) {
    console.error('[GooglePlay Verify] Error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Google Play payment verification failed',
    });
  }
};

/**
 * POST /payment/google/pending
 * Records a 'processing' order when a Google Play purchase enters PENDING state,
 * so it shows up in purchase history with processing status (parity with Razorpay).
 * Idempotent by purchaseToken. The real validity/amount are finalized on verify.
 */
export const recordGooglePendingPurchase = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId, purchaseToken, type, region = 'OTHER_USD' } = req.body;
    if (!productId || !purchaseToken) {
      return res.status(400).json({ success: false, message: 'productId and purchaseToken are required' });
    }

    // Idempotent: if an order already exists for this token, return it
    const existing = await Order.findOne({ parentUserId, providerPurchaseToken: purchaseToken });
    if (existing) {
      return res.json({ success: true, order: existing, alreadyRecorded: true });
    }

    const mapped = mapGoogleProductIdToInternal(productId);
    const resolvedType = type || mapped?.type || 'plan';
    const internalId = mapped?.internalId || productId;
    const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';

    let orderType: 'plan' | 'storage_addon' | 'live_addon' = 'plan';
    let planLabel = 'Purchase';
    let amount = 0;
    const currency = normRegion === 'IN_INR' ? '₹' : '$';
    let planIdVal: string | undefined;
    let addonIdVal: string | undefined;

    if (resolvedType === 'addon') {
      const addon = await AddonPlan.findOne({ addonId: internalId, isActive: true });
      if (addon) {
        orderType = addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon';
        planLabel = addon.name;
        addonIdVal = addon.addonId;
        const priceSource = (addon as any).appPriceByRegion || (addon as any).priceByRegion || {};
        amount = normRegion === 'IN_INR' ? (priceSource.IN_INR ?? 0) : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 0);
      }
    } else {
      const plan = await Plan.findOne({ planId: internalId, isActive: true });
      if (plan) {
        orderType = 'plan';
        planLabel = plan.name;
        planIdVal = plan.planId;
        const priceSource = (plan as any).appPriceByRegion || (plan as any).priceByRegion || {};
        amount = normRegion === 'IN_INR' ? (priceSource.IN_INR ?? 0) : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 0);
      }
    }

    const now = new Date();
    const order = await Order.create({
      parentUserId,
      type: orderType,
      planId: planIdVal,
      addonId: addonIdVal,
      planLabel,
      amount,
      currency,
      validityStart: now,
      validityEnd: now,
      txnId: `txn_gplay_pending_${purchaseToken.substring(0, 20)}_${Date.now()}`,
      status: 'pending',
      paymentStatus: 'processing',
      planStatus: 'processing',
      reconcileBy: new Date(now.getTime() + 15 * 60 * 1000),
      paymentProvider: 'google_play',
      providerPurchaseToken: purchaseToken,
      autoRenew: false,
      metadata: { region: normRegion, source: 'google_pending' },
    });

    return res.json({ success: true, order });
  } catch (err: any) {
    console.error('[GooglePlay Pending] Error:', err?.message);
    return res.status(500).json({ success: false, message: err?.message || 'Failed to record pending purchase' });
  }
};

/**
 * POST /payment/google/webhook
 * Receives Real-Time Developer Notifications (RTDN) pushed via Cloud Pub/Sub.
 * Idempotent by Pub/Sub message.messageId.
 * Manual renewal architecture: auto-renew subscription renewals are removed.
 * Handles VOIDED_PURCHASE notifications to mark orders refunded and revoke entitlements.
 */
export const handleGooglePlayWebhook = async (req: Request, res: Response) => {
  try {
    // 1. Optional Pub/Sub verification token check
    if (config.googlePlay.pubsubVerificationToken) {
      const token = req.query.token || req.headers['x-goog-pubsub-token'];
      if (token !== config.googlePlay.pubsubVerificationToken) {
        return res.status(403).json({ success: false, message: 'Invalid Pub/Sub verification token' });
      }
    }

    const { message } = req.body || {};
    if (!message || !message.data) {
      return res.status(400).json({ success: false, message: 'Invalid Pub/Sub payload: missing message.data' });
    }

    const messageId = message.messageId;

    // 2. Idempotency check on Pub/Sub messageId
    if (messageId) {
      const redis = getRedisClient();
      if (redis) {
        const isNew = await redis.set(`google:pubsub:${messageId}`, '1', 'EX', 86400, 'NX');
        if (!isNew) {
          return res.status(200).json({ success: true, message: 'Duplicate messageId ignored' });
        }
      } else {
        if (processedPubsubMessages.has(messageId)) {
          return res.status(200).json({ success: true, message: 'Duplicate messageId ignored' });
        }
        processedPubsubMessages.add(messageId);
        if (processedPubsubMessages.size > 5000) {
          const firstKey = processedPubsubMessages.values().next().value;
          if (firstKey) processedPubsubMessages.delete(firstKey);
        }
      }
    }

    // 3. Decode base64 notification payload
    let notification: any;
    try {
      const decodedStr = Buffer.from(message.data, 'base64').toString('utf8');
      notification = JSON.parse(decodedStr);
    } catch (parseErr) {
      console.error('[GooglePlay Webhook] Failed to decode Pub/Sub data base64:', parseErr);
      return res.status(200).json({ success: false, message: 'Payload parse error' });
    }

    // 4. Handle test notifications (sent by Play Console when setting up Pub/Sub)
    if (notification.testNotification) {
      console.log('[GooglePlay Webhook] Received Play Console testNotification');
      return res.status(200).json({ success: true, test: true });
    }

    // 5. Handle Voided Purchase Notifications (Refunds / Chargebacks / Revocations)
    if (notification.voidedPurchaseNotification) {
      const { purchaseToken, orderId } = notification.voidedPurchaseNotification;
      console.log(`[GooglePlay Webhook] voidedPurchaseNotification orderId=${orderId}`);

      const filter: any = {};
      if (orderId && purchaseToken) {
        filter.$or = [{ providerPurchaseToken: purchaseToken }, { providerOrderId: orderId }];
      } else if (orderId) {
        filter.providerOrderId = orderId;
      } else if (purchaseToken) {
        filter.providerPurchaseToken = purchaseToken;
      }

      if (Object.keys(filter).length > 0) {
        // Mark matching orders as refunded
        await Order.updateMany(filter, { $set: { status: 'refunded', paymentStatus: 'refunded', planStatus: 'in_active', refundInfo: { at: new Date(), reason: 'Google Play refund/void' } } });

        // Revoke active or queued subscription if linked
        const sub = await Subscription.findOne({
          $or: [
            ...(purchaseToken ? [{ providerRef: purchaseToken }, { providerPurchaseToken: purchaseToken }] : []),
            ...(orderId ? [{ providerOrderId: orderId }] : []),
          ],
        });

        if (sub) {
          // If queued plan matches, remove queued plan
          if (sub.queuedPlan && ((sub.queuedPlan as any).txnId?.includes(orderId || purchaseToken) || (sub.queuedPlan as any).providerPurchaseToken === purchaseToken)) {
            await Subscription.updateOne(
              { _id: sub._id },
              { $unset: { queuedPlan: 1 }, $set: { lastPaymentSyncAt: new Date() } }
            );
          } else if (sub.status === 'active' || sub.status === 'grace') {
            await Subscription.updateOne(
              { _id: sub._id },
              {
                $set: {
                  status: 'expired',
                  autoRenew: false,
                  lastPaymentSyncAt: new Date(),
                },
              }
            );
          }
        }
      }
    }

    // 6. Handle One-Time In-App Product Notifications (Purchased / Canceled)
    if (notification.oneTimeProductNotification) {
      const { notificationType, purchaseToken, sku } = notification.oneTimeProductNotification;
      console.log(`[GooglePlay Webhook] One-time product notificationType=${notificationType}`);

      if (notificationType === 1) { // ONE_TIME_PRODUCT_PURCHASED
        const existingOrder = await Order.findOne({
          providerPurchaseToken: purchaseToken,
          status: 'completed',
        });

        if (!existingOrder) {
          const verification = await verifyProductPurchase(sku, purchaseToken);
          if (verification.valid) {
            await consumeProductPurchase(sku, purchaseToken);

            const pendingOrder = await Order.findOne({
              $or: [
                { providerPurchaseToken: purchaseToken },
                { providerOrderId: verification.orderId },
              ],
            });

            const parentUserId = pendingOrder?.parentUserId;
            if (parentUserId) {
              const mapped = mapGoogleProductIdToInternal(sku);
              if (mapped?.type === 'addon') {
                const addon = await AddonPlan.findOne({ addonId: mapped.internalId, isActive: true });
                if (addon) {
                  await applyEntitlement({
                    parentUserId,
                    type: addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon',
                    addonId: addon.addonId,
                    region: (pendingOrder?.metadata as any)?.region || 'OTHER_USD',
                    platform: 'app',
                    paymentProvider: 'google_play',
                    providerOrderId: verification.orderId,
                    providerPurchaseToken: purchaseToken,
                    autoRenew: false,
                    existingOrderId: String(pendingOrder._id),
                  });
                }
              } else {
                const planId = mapped?.internalId || sku;
                const plan = await Plan.findOne({ planId, isActive: true });
                if (plan) {
                  await applyEntitlement({
                    parentUserId,
                    type: 'plan',
                    planId: plan.planId,
                    region: (pendingOrder?.metadata as any)?.region || 'OTHER_USD',
                    platform: 'app',
                    paymentProvider: 'google_play',
                    providerOrderId: verification.orderId,
                    providerPurchaseToken: purchaseToken,
                    providerSubscriptionId: purchaseToken,
                    autoRenew: false,
                    existingOrderId: String(pendingOrder._id),
                  });
                }
              }
            }
          }
        }
      } else if (notificationType === 2) { // ONE_TIME_PRODUCT_CANCELED
        await Order.updateMany(
          { providerPurchaseToken: purchaseToken },
          { $set: { status: 'refunded', paymentStatus: 'refunded', planStatus: 'in_active', refundInfo: { at: new Date(), reason: 'Google Play refund/void' } } }
        );
      }
    }

    // 7. Handle Legacy Subscription Notifications (Revocation only, NO auto-renew)
    if (notification.subscriptionNotification) {
      const { notificationType, purchaseToken } = notification.subscriptionNotification;
      console.log(`[GooglePlay Webhook] Subscription notificationType=${notificationType} (Manual renewal mode - auto-renew suppressed)`);

      if (notificationType === 12) { // SUBSCRIPTION_REVOKED
        await Subscription.updateMany(
          {
            $or: [
              { providerRef: purchaseToken },
              { providerSubscriptionId: purchaseToken },
            ],
          },
          {
            $set: {
              status: 'expired',
              autoRenew: false,
              lastPaymentSyncAt: new Date(),
            },
          }
        );
        await Order.updateMany(
          { providerPurchaseToken: purchaseToken },
          { $set: { status: 'refunded', paymentStatus: 'refunded', planStatus: 'in_active', refundInfo: { at: new Date(), reason: 'Google Play refund/void' } } }
        );
      }
    }

    return res.status(200).json({ success: true, processed: true });
  } catch (err: any) {
    console.error('[GooglePlay Webhook] Error:', err);
    return res.status(200).json({ success: false, message: err?.message || 'Webhook processing failed' });
  }
};
