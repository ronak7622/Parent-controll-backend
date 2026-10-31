import { Plan, IPlan } from '../models/Plan';
import { AddonPlan, IAddonPlan } from '../models/AddonPlan';
import { Subscription, ISubscription, IPlanSnapshot, IQueuedPlan } from '../models/Subscription';
import { Order, IOrder } from '../models/Order';
import { Device } from '../models/Device';
import { ConfigService } from './ConfigService';
import { StorageAccountingService } from './StorageAccountingService';
import { StorageDeleteService } from './StorageDeleteService';
import { sendFcmDataCommand } from './fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';

export interface ApplyEntitlementParams {
  parentUserId: string;
  type: 'plan' | 'storage_addon' | 'live_addon';
  planId?: string;
  addonId?: string;
  region: string;
  paymentProvider: 'razorpay' | 'google_play' | 'trial' | 'none';
  providerOrderId?: string;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  providerPurchaseToken?: string;
  autoRenew?: boolean;
  allowStorageTrim?: boolean;
  existingOrderId?: string;
  customTxnId?: string;
  idempotencyKey?: string;
  platform?: 'web' | 'app';
}

export interface ApplyEntitlementResult {
  subscription: ISubscription;
  order: IOrder;
  isQueued: boolean;
}

/**
 * Builds plan snapshot with proper durations, limits, and grace periods.
 */
export async function buildPlanSnapshot(
  plan: IPlan,
  region: string,
  platform: 'web' | 'app' = 'web'
): Promise<{
  planSnapshot: IPlanSnapshot;
  durationMs: number;
  durationDays: number;
  graceMs: number;
  graceDays: number;
  price: number;
  currency: string;
}> {
  const options = await ConfigService.getMergedOptions();
  const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';
  const priceSource = platform === 'web'
    ? ((plan as any).webPriceByRegion || (plan as any).priceByRegion || {})
    : ((plan as any).appPriceByRegion || (plan as any).priceByRegion || {});
  const price = normRegion === 'IN_INR'
    ? (priceSource.IN_INR ?? 299)
    : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 9.99);
  const currency = normRegion === 'IN_INR' ? '₹' : '$';

  const defaultDaysByType =
    plan.type === 'yearly' ? 365 : (plan.type === '6_months' || plan.type === 'half_yearly' ? 180 : 30);
  const durationMinutes =
    plan.planDurationValueInMinute ||
    ((plan as any).durationValue > 0
      ? (plan as any).durationValue * 1440
      : (((plan as any).dayLimit || defaultDaysByType) * 1440));
  const durationDays = Math.round(durationMinutes / 1440);
  const durationMs = durationMinutes * 60 * 1000;
  const graceTimeInMinute = plan.graceTimeInMinute || 4320;
  const graceMs = graceTimeInMinute * 60 * 1000;
  const graceDays = Math.ceil(graceTimeInMinute / 1440);

  const liveLimitPerDay = plan.liveLimitPerDayInMinutes || (plan as any).liveLimitPerDay || 60;
  const liveMinutesTotal = plan.liveLimitTotalInMinute || (plan as any).liveMinutesTotal || (liveLimitPerDay * durationDays);

  const planSnapshot: IPlanSnapshot = {
    planId: plan.planId,
    name: plan.name,
    type: plan.type,
    price,
    storageBytes: plan.storageBytes,
    liveMinutesTotal,
    liveLimitTotalInMinute: liveMinutesTotal,
    liveLimitPerDay,
    liveLimitPerDayInMinutes: liveLimitPerDay,
    liveSessionMaxMin: options.liveSessionMaxMin || 5,
    deviceLimit: plan.deviceLimit,
    dayLimit: durationDays,
    planDurationValueInMinute: durationMinutes,
    planDurationUnit: plan.planDurationUnit || 'minutes',
    graceTimeInMinute,
    planPriceDiscountPercen: plan.planPriceDiscountPercen || 0,
    durationMs,
    graceDays,
    storageWarnPercent: options.storageWarnDialogPercent || options.storageWarnNotificationPercent || 80,
    features: plan.features || [],
    isAllowSocialAppChatHistory: (plan as any).isAllowSocialAppChatHistory ?? false };

  return { planSnapshot, durationMs, durationDays, graceMs, graceDays, price, currency };
}

/**
 * Sends dual-path SUBSCRIPTION_RESUME to all child devices of parent.
 */
export async function sendResumeSignal(parentUserId: string, expireAt: Date, graceEndsAt: Date): Promise<void> {
  try {
    const devices = await Device.find({ parentUserId });
    for (const d of devices) {
      try {
        getSignalingIo()?.to(d.deviceId).emit('remote-command', {
          command: 'SUBSCRIPTION_RESUME',
          action: 'RESUME_AND_UPLOAD',
          deviceId: d.deviceId,
          status: 'active' });
      } catch (_) {}

      if (d.fcmToken) {
        await sendFcmDataCommand(d.fcmToken, 'SUBSCRIPTION_RESUME', {
          status: 'active',
          expireAt: expireAt.toISOString(),
          graceEndsAt: graceEndsAt.toISOString() }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Entitlement] Failed to send resume signals to devices:', err);
  }
}

/**
 * Unified, SSOT entitlement engine helper.
 * Strictly avoids multi-document MongoDB transactions (standalone Mongo compatibility).
 * Uses atomic findOneAndUpdate + unique indexes for safe concurrency and idempotency.
 */
export async function applyEntitlement(params: ApplyEntitlementParams): Promise<ApplyEntitlementResult> {
  const {
    parentUserId,
    type,
    planId,
    addonId,
    region,
    paymentProvider,
    providerOrderId,
    providerPaymentId,
    providerSubscriptionId,
    providerPurchaseToken,
    autoRenew = false,
    allowStorageTrim = false,
    existingOrderId,
    customTxnId,
    idempotencyKey } = params;

  const now = new Date();
  // ══════════════════════════════════════════════════════════════════════
  // GST COMPUTATION (Dormant by default, config-driven)
  // When gstEnabled === true AND region is IN_INR, compute reverse-breakup.
  // The customer still pays the exact same total price.
  // ══════════════════════════════════════════════════════════════════════
  const configOptions = await ConfigService.getMergedOptions();
  const isGstActive = configOptions.gstEnabled === true && (region === 'IN_INR' || !region || region === 'IN');
  const gstRate = Number(configOptions.gstRatePercent) || 18;
  const gstinVal = configOptions.gstin ? String(configOptions.gstin).trim() : undefined;

  const computeGstFields = (grossAmount: number) => {
    if (!isGstActive || grossAmount <= 0) return {};
    const baseAmount = Math.round((grossAmount / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount = Math.round((grossAmount - baseAmount) * 100) / 100;
    return {
      baseAmount,
      gstAmount,
      gstRatePercent: gstRate,
      ...(gstinVal ? { gstin: gstinVal } : {}),
    };
  };
  const txnId = customTxnId || providerPaymentId || providerOrderId || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // ══════════════════════════════════════════════════════════════════════
  // GUARD #3: DEDUPLICATION / IDEMPOTENCY CHECK
  // Prevent duplicate double-apply if webhook and /verify arrive together
  // ══════════════════════════════════════════════════════════════════════
  // Deduplication / Idempotency check across payment ID, purchase token, or gateway order ID
  if (providerPaymentId || providerPurchaseToken || providerOrderId) {
    const existingCompleted = await Order.findOne({
      parentUserId,
      $or: [
        ...(providerPaymentId ? [{ providerPaymentId, status: 'completed' }] : []),
        ...(providerPurchaseToken ? [{ providerPurchaseToken, status: 'completed' }] : []),
        ...(providerOrderId ? [{ providerOrderId, status: 'completed' }] : []),
      ] });
    if (existingCompleted) {
      const currentSub = await Subscription.findOne({ parentUserId });
      return {
        subscription: currentSub!,
        order: existingCompleted,
        isQueued: false };
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CASE 1: ADDON PURCHASES (Storage or Live Minutes Booster)
  // ══════════════════════════════════════════════════════════════════════
  if (type === 'storage_addon' || type === 'live_addon') {
    const addon = await AddonPlan.findOne({ addonId, isActive: true });
    if (!addon) throw new Error('Addon plan not found or inactive');

    const subscription = await Subscription.findOne({ parentUserId });
    if (!subscription || subscription.status === 'expired' || subscription.status === 'grace' || subscription.isTrial || (subscription.expireAt && subscription.expireAt < now)) {
      throw new Error('Add-on boosters can only be added to an active paid subscription.');
    }

    const normRegion = region === 'IN_INR' || region === 'IN' ? 'IN_INR' : 'OTHER_USD';
    const isWeb = (params.platform || (paymentProvider === 'razorpay' ? 'web' : 'app')) === 'web';
    const priceSource = isWeb
      ? ((addon as any).webPriceByRegion || (addon as any).priceByRegion || {})
      : ((addon as any).appPriceByRegion || (addon as any).priceByRegion || {});
    const price = normRegion === 'IN_INR'
      ? (priceSource.IN_INR ?? 99)
      : (priceSource.OTHER_USD ?? priceSource.HIGH_USD ?? 3.99);
    const currency = normRegion === 'IN_INR' ? '₹' : '$';

    const incUpdate: any = {};
    const setUpdate: any = {
      paymentProvider: subscription.paymentProvider || paymentProvider,
      lastPaymentSyncAt: now };

    if (addon.type === 'live_minutes') {
      incUpdate.addonLiveMinutesPool = addon.liveMinutes || 0;
      setUpdate.lastPurchasedLiveAddonId = addon.addonId;
      setUpdate.addonLiveExhaustedNotified = false;
    } else {
      incUpdate.addonStorageBytes = addon.storageBytes || 0;
      setUpdate.lastPurchasedStorageAddonId = addon.addonId;
    }

    // Atomic update preserving existing validity
    const updatedSub = await Subscription.findOneAndUpdate(
      { parentUserId },
      { $inc: incUpdate, $set: setUpdate },
      { new: true }
    );

    if (!updatedSub) throw new Error('Failed to update subscription with add-on');

    // Update or create Order
    let order: IOrder | null = null;
    if (existingOrderId) {
      order = await Order.findByIdAndUpdate(
        existingOrderId,
        {
          $set: {
            status: 'completed',
            paymentProvider,
            providerOrderId,
            providerPaymentId,
            providerPurchaseToken,
            autoRenew: false,
            validityStart: updatedSub.startAt || now,
            validityEnd: updatedSub.expireAt,
            ...computeGstFields(price) } },
        { new: true }
      );
    }

    if (!order && providerOrderId) {
      order = await Order.findOneAndUpdate(
        { providerOrderId, parentUserId },
        {
          $set: {
            status: 'completed',
            paymentProvider,
            providerOrderId,
            providerPaymentId,
            providerPurchaseToken,
            autoRenew: false,
            validityStart: updatedSub.startAt || now,
            validityEnd: updatedSub.expireAt,
            ...computeGstFields(price) } },
        { new: true }
      );
    }

    if (!order) {
      order = await Order.create({
        parentUserId,
        type: addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon',
        addonId: addon.addonId,
        planLabel: addon.name,
        amount: price,
        currency,
        validityStart: updatedSub.startAt || now,
        validityEnd: updatedSub.expireAt,
        txnId,
        status: 'completed',
        paymentProvider,
        providerOrderId,
        providerPaymentId,
        providerPurchaseToken,
        autoRenew: false,
        ...computeGstFields(price),
        metadata: { region, addonType: addon.type } });
    }

    return { subscription: updatedSub, order, isQueued: false };
  }

  // ══════════════════════════════════════════════════════════════════════
  // CASE 2: MAIN PLAN PURCHASE (Manual Renewal / One-Time Validity)
  // ══════════════════════════════════════════════════════════════════════
  const currentSub = await Subscription.findOne({ parentUserId });

  // Resolve plan
  const targetPlanId = planId || currentSub?.planSnapshot?.planId;
  const plan = await Plan.findOne({ planId: targetPlanId, isActive: true });
  if (!plan) throw new Error(`Plan not found: ${targetPlanId}`);

  const isWebForPlan = (params.platform || (paymentProvider === 'razorpay' ? 'web' : 'app')) === 'web';
  const { planSnapshot, durationMs, durationDays, graceMs, price, currency } = await buildPlanSnapshot(
    plan,
    region,
    isWebForPlan ? 'web' : 'app'
  );

  // Storage Downgrade Check for new plans
  const newAllowedStorage = plan.storageBytes || 10737418240;
  const currentUsageDoc = await StorageAccountingService.getStorageUsage(parentUserId);
  const currentUsedBytes = currentUsageDoc?.totalBytes || 0;

  if (newAllowedStorage < currentUsedBytes && allowStorageTrim !== true) {
    throw new Error('STORAGE_DOWNGRADE_NEEDS_CONFIRM: Plan storage limit is smaller than current data usage.');
  }

  const isRealPlanActive = Boolean(currentSub && currentSub.status === 'active' && !currentSub.isTrial && currentSub.expireAt > now);

  // ----------------------------------------------------------------------
  // SUB-CASE 2A: ADVANCE QUEUED PLAN
  // If user already has an active paid plan, pre-buy for the next period
  // ----------------------------------------------------------------------
  if (currentSub && isRealPlanActive) {
    if (currentSub.queuedPlan && (currentSub.queuedPlan as any).planSnapshot) {
      throw new Error('ADVANCE_PLAN_ALREADY_QUEUED: Only 1 advance plan is allowed in queue.');
    }

    const queuedPlanData: IQueuedPlan = {
      planSnapshot,
      durationDays,
      durationMs,
      txnId,
      region,
      purchasedAt: now,
      allowStorageTrim: Boolean(allowStorageTrim) };

    const updatedSub = await Subscription.findOneAndUpdate(
      { parentUserId },
      {
        $set: {
          queuedPlan: queuedPlanData,
          autoRenew: false,
          lastPaymentSyncAt: now } },
      { new: true }
    );

    if (!updatedSub) throw new Error('Failed to queue advance plan');

    let order: IOrder | null = null;
    if (existingOrderId) {
      order = await Order.findByIdAndUpdate(
        existingOrderId,
        {
          $set: {
            status: 'queued',
            paymentProvider,
            providerOrderId,
            providerPaymentId,
            providerPurchaseToken,
            autoRenew: false,
            validityStart: currentSub.expireAt,
            validityEnd: new Date(currentSub.expireAt.getTime() + durationMs),
            ...computeGstFields(price) } },
        { new: true }
      );
    }

    if (!order) {
      order = await Order.create({
        parentUserId,
        type: 'plan',
        planId: plan.planId,
        planLabel: `${plan.name} (Advance Queued)`,
        amount: price,
        currency,
        validityStart: currentSub.expireAt,
        validityEnd: new Date(currentSub.expireAt.getTime() + durationMs),
        txnId,
        status: 'queued',
        paymentProvider,
        providerOrderId,
        providerPaymentId,
        providerPurchaseToken,
        autoRenew: false,
        ...computeGstFields(price),
        metadata: { region, queued: true } });
    }

    return { subscription: updatedSub, order, isQueued: true };
  }

  // ----------------------------------------------------------------------
  // SUB-CASE 2B: IMMEDIATE PLAN ACTIVATION (Manual Renewal or First Buy)
  // When no active paid plan (trial, grace, expired, or first-time purchase)
  // ----------------------------------------------------------------------
  const startAt = now;
  const expireAt = new Date(startAt.getTime() + durationMs);
  const graceEndsAt = new Date(expireAt.getTime() + graceMs);

  const updatedSub = await Subscription.findOneAndUpdate(
    { parentUserId },
    {
      $set: {
        parentUserId,
        status: 'active',
        planSnapshot,
        planLiveMinutesUsed: 0,
        liveTotalLimitNotified: false,
        addonStorageBytes: 0,        // Add-ons reset at period boundary
        addonLiveMinutesPool: 0,     // Add-ons reset at period boundary
        queuedPlan: undefined,
        startAt,
        expireAt,
        graceEndsAt,
        txnId,
        idempotencyKey,
        region,
        isTrial: false,
        paymentProvider,
        providerRef: providerOrderId || providerPaymentId || providerPurchaseToken,
        autoRenew: false,
        lastPaymentSyncAt: now,
        lastExpireWarnNotificationAt: undefined,
        lastStorageWarnNotificationAt: undefined } },
    { upsert: true, new: true }
  );

  if (!updatedSub) throw new Error('Failed to save active subscription');

  if (allowStorageTrim && newAllowedStorage < currentUsedBytes) {
    await StorageDeleteService.trimOldestExcessStorage(parentUserId, newAllowedStorage).catch(() => {});
  }

  let order: IOrder | null = null;
  if (existingOrderId) {
    order = await Order.findByIdAndUpdate(
      existingOrderId,
      {
        $set: {
          status: 'completed',
          paymentProvider,
          providerOrderId,
          providerPaymentId,
          providerPurchaseToken,
          autoRenew: false,
          validityStart: startAt,
          validityEnd: expireAt,
          ...computeGstFields(price) } },
      { new: true }
    );
  }

  if (!order) {
    order = await Order.create({
      parentUserId,
      type: 'plan',
      planId: plan.planId,
      planLabel: plan.name,
      amount: price,
      currency,
      validityStart: startAt,
      validityEnd: expireAt,
      txnId,
      status: 'completed',
      paymentProvider,
      providerOrderId,
      providerPaymentId,
      providerPurchaseToken,
      autoRenew: false,
      metadata: { region } });
  }

  // Dual-path RESUME signal to child devices
  await sendResumeSignal(parentUserId, expireAt, graceEndsAt);

  return { subscription: updatedSub, order, isQueued: false };
}
