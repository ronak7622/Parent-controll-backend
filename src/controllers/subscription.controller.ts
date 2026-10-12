import { Request, Response } from 'express';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { Subscription } from '../models/Subscription';
import { TrialLedger } from '../models/TrialLedger';
import { StorageUsage } from '../models/StorageUsage';
import { LiveUsage } from '../models/LiveUsage';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Order } from '../models/Order';
import { ConfigService } from '../services/ConfigService';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { StorageDeleteService } from '../services/StorageDeleteService';
import { sendFcmDataCommand } from '../services/fcm.service';
import { toMs, DurationUnit } from '../utils/duration';

export const getOptionsConfig = async (req: Request, res: Response) => {
  try {
    const options = await ConfigService.getMergedOptions();
    return res.json({ success: true, options });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const getPlans = async (req: Request, res: Response) => {
  try {
    const rawParam = ((req.query.region || req.query.country || req.headers['cf-ipcountry'] || req.headers['x-country-code'] || 'IN') as string).toUpperCase();
    const options = await ConfigService.getMergedOptions();
    const regionTierMap = options.regionTierMap || {};

    let resolvedRegion = regionTierMap[rawParam] || rawParam;
    if (!['IN_INR', 'LOW_USD', 'HIGH_USD'].includes(resolvedRegion)) {
      resolvedRegion = regionTierMap.DEFAULT || 'HIGH_USD';
    }

    const countryListsByRegion = {
      IN_INR: ['IN'],
      LOW_USD: ['PK', 'BD', 'NP', 'LK', 'NG', 'PH', 'VN', 'ID', 'EG', 'KE', 'TZ', 'UG', 'BR', 'MX', 'AR', 'CO'],
      HIGH_USD: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'AE', 'SA', 'JP', 'SG', 'NZ', 'KR', 'IT', 'ES', 'NL', 'SE', 'GLOBAL'],
    };

    // Seed default plans if DB empty or trial plan missing
    const trialPlanExists = await Plan.findOne({ planId: 'plan_1_day_trial' });
    if (!trialPlanExists) {
      const makeFeatures = (deviceText: string, storageText: string) => [
        'No ads',
        deviceText,
        'Live screen mirro',
        'Live video camera',
        'Live Audio',
        'Screenshot schedule and capture silent screenshot',
        'Youtube history and Control',
        'Browser history and control',
        'Live location trakcer',
        'Location history',
        'Driving detection',
        'Call history',
        'contact management',
        'auto call recording',
        'sms message history',
        'App uses and screen time',
        'App mangement block schedule and uses time limit',
        'wifi logger',
        'internet logger',
        'keyword trackker and key logger',
        'all apps Notifications',
        'Remotly rec video audio and screen recording',
        storageText,
      ];

      const defaultPlans = [
        {
          planId: 'plan_1_day_trial',
          name: '1 Day Free Trial',
          type: 'trial',
          priceByRegion: { IN_INR: 0, LOW_USD: 0, HIGH_USD: 0 },
          storageBytes: 104857600, // 100 MB
          dayLimit: 1,
          liveMinutesTotal: 10,
          liveLimitPerDay: 10,
          liveSessionMaxMin: 2,
          deviceLimit: 1,
          features: makeFeatures('1 device connect', '100 mb storage'),
          isActive: true,
          isRecommended: false,
          sortOrder: 0,
        },
        {
          planId: 'plan_1_month',
          name: '1 Month Plan',
          type: 'monthly',
          priceByRegion: { IN_INR: 1000, LOW_USD: 14.99, HIGH_USD: 24.99 },
          storageBytes: 21474836480, // 20 GB
          dayLimit: 30,
          liveMinutesTotal: 1800,
          liveLimitPerDay: 60,
          liveSessionMaxMin: 10,
          deviceLimit: 1000, // Unlimited
          features: makeFeatures('Unlimited device connect', '20 gb storage'),
          isActive: true,
          sortOrder: 1,
        },
        {
          planId: 'plan_6_months',
          name: '6 Months Plan',
          type: '6_months',
          priceByRegion: { IN_INR: 2500, LOW_USD: 34.99, HIGH_USD: 59.99 },
          storageBytes: 21474836480, // 20 GB
          dayLimit: 180,
          liveMinutesTotal: 10800,
          liveLimitPerDay: 60,
          liveSessionMaxMin: 10,
          deviceLimit: 1000, // Unlimited
          features: makeFeatures('Unlimited device connect', '20 gb storage'),
          isActive: true,
          isRecommended: false,
          sortOrder: 2,
        },
        {
          planId: 'plan_1_year',
          name: '1 Year Plan',
          type: 'yearly',
          priceByRegion: { IN_INR: 2000, LOW_USD: 29.99, HIGH_USD: 49.99 },
          storageBytes: 21474836480, // 20 GB
          dayLimit: 365,
          liveMinutesTotal: 21900,
          liveLimitPerDay: 60,
          liveSessionMaxMin: 10,
          deviceLimit: 1000, // Unlimited
          features: makeFeatures('Unlimited device connect', '20 gb storage'),
          isActive: true,
          isRecommended: true,
          sortOrder: 3,
        },
      ];

      for (const p of defaultPlans) {
        await Plan.findOneAndUpdate({ planId: p.planId }, { $set: p }, { upsert: true, new: true });
      }
    }

    const addonCount = await AddonPlan.countDocuments();
    if (addonCount === 0) {
      await AddonPlan.create([
        {
          addonId: 'addon_5gb',
          name: '+5 GB Storage Booster',
          type: 'storage',
          priceByRegion: { IN_INR: 99, LOW_USD: 1.49, HIGH_USD: 2.99 },
          storageBytes: 5368709120,
          liveMinutes: 0,
          isActive: true,
        },
        {
          addonId: 'addon_20gb',
          name: '+20 GB Storage Booster',
          type: 'storage',
          priceByRegion: { IN_INR: 299, LOW_USD: 3.99, HIGH_USD: 7.99 },
          storageBytes: 21474836480,
          liveMinutes: 0,
          isActive: true,
        },
        {
          addonId: 'addon_50gb',
          name: '+50 GB Storage Booster',
          type: 'storage',
          priceByRegion: { IN_INR: 599, LOW_USD: 7.99, HIGH_USD: 14.99 },
          storageBytes: 53687091200,
          liveMinutes: 0,
          isActive: true,
        },
        {
          addonId: 'addon_live_60m',
          name: '+1 Hour Live Feature Booster',
          type: 'live_minutes',
          priceByRegion: { IN_INR: 49, LOW_USD: 0.99, HIGH_USD: 1.99 },
          storageBytes: 0,
          liveMinutes: 60,
          isActive: true,
        },
        {
          addonId: 'addon_live_120m',
          name: '+2 Hours Live Feature Booster',
          type: 'live_minutes',
          priceByRegion: { IN_INR: 89, LOW_USD: 1.79, HIGH_USD: 3.49 },
          storageBytes: 0,
          liveMinutes: 120,
          isActive: true,
        },
        {
          addonId: 'addon_live_300m',
          name: '+5 Hours Live Feature Booster',
          type: 'live_minutes',
          priceByRegion: { IN_INR: 199, LOW_USD: 3.99, HIGH_USD: 7.99 },
          storageBytes: 0,
          liveMinutes: 300,
          isActive: true,
        },
      ]);
    }

    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    const addons = await AddonPlan.find({ isActive: true }).lean();

    const phone = (req as any).user?.phoneNumber || (req as any).user?.phone || '';
    const email = (req as any).user?.email || '';
    const canSeeTest = ((options as any).testPlanPhones || []).includes(phone) || ((options as any).testPlanEmails || []).includes(email);
    const visiblePlans = plans.filter((p) => canSeeTest || !(p as any).isTestPlan);

    // Compute monthly vs yearly savings dynamically from the plan data
    const monthlyPlan = visiblePlans.find((p) => p.type === 'monthly' && p.isRecommended) || visiblePlans.find((p) => p.type === 'monthly');
    const yearlyPlan = visiblePlans.find((p) => p.type === 'yearly');

    let dynamicSavePercent = 35; // fallback
    if (monthlyPlan && yearlyPlan) {
      const mPrice = monthlyPlan.priceByRegion[resolvedRegion as keyof typeof monthlyPlan.priceByRegion] || monthlyPlan.priceByRegion.HIGH_USD;
      const yPrice = yearlyPlan.priceByRegion[resolvedRegion as keyof typeof yearlyPlan.priceByRegion] || yearlyPlan.priceByRegion.HIGH_USD;
      const annualizedMonthly = mPrice * 12;
      if (annualizedMonthly > 0 && yPrice < annualizedMonthly) {
        dynamicSavePercent = Math.round(((annualizedMonthly - yPrice) / annualizedMonthly) * 100);
      }
    }

    const formattedPlans = visiblePlans.map((p) => {
      const price = p.priceByRegion[resolvedRegion as keyof typeof p.priceByRegion] || p.priceByRegion.HIGH_USD;
      const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';
      const days = p.dayLimit || (p.type === 'yearly' ? 365 : (p.type === '6_months' || p.type === 'half_yearly' ? 180 : 30));
      
      // Calculate effective monthly price dynamically based on actual plan duration
      let months = days / 30;
      if (months < 1) months = 1;
      const perMonthPrice = months > 1 ? Math.round((price / months) * 100) / 100 : price;
      
      const storageGB = Math.round(p.storageBytes / (1024 * 1024 * 1024));
      const isUnlimitedDevices = (p.deviceLimit || 0) >= 1000;
      const livePerDay = p.liveLimitPerDay || Math.round((p.liveMinutesTotal || 30) / 2) || 15;

      let billingCycleText = 'Billed monthly';
      if (p.type === 'yearly' || days >= 365) {
        billingCycleText = `Billed annually ${currency}${price}`;
      } else if (p.type === '6_months' || p.type === 'half_yearly' || days >= 180) {
        billingCycleText = `Billed semi-annually ${currency}${price}`;
      } else if (p.type === '3_months' || p.type === 'quarterly' || days >= 90) {
        billingCycleText = `Billed quarterly ${currency}${price}`;
      } else if (days !== 30) {
        billingCycleText = `Billed every ${days} days (${currency}${price})`;
      }

      return {
        ...p,
        resolvedPrice: price,
        currency,
        perMonthPrice,
        storageGB,
        liveLimitPerDay: livePerDay,
        deviceLimit: p.deviceLimit,
        deviceLimitText: isUnlimitedDevices ? 'Unlimited' : `${p.deviceLimit} Connected Device${p.deviceLimit > 1 ? 's' : ''}`,
        liveMinutesText: `${livePerDay} Mins Daily Live`,
        dayLimit: days,
        featuresList: p.features,
        region: resolvedRegion,
        billingCycleText,
        dynamicSavePercent: p.type === 'yearly' ? dynamicSavePercent : 0,
      };
    });

    const formattedAddons = addons.map((a) => {
      const price = a.priceByRegion[resolvedRegion as keyof typeof a.priceByRegion] || a.priceByRegion.HIGH_USD;
      const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';
      const storageGB = a.storageBytes ? Math.round(a.storageBytes / (1024 * 1024 * 1024)) : 0;
      return {
        ...a,
        resolvedPrice: price,
        currency,
        storageGB,
        region: resolvedRegion,
      };
    });

    const storageAddons = formattedAddons.filter((a) => a.type === 'storage' || !a.type);
    const liveMinutesAddons = formattedAddons.filter((a) => a.type === 'live_minutes');

    const trialOptions = options.trialPlanConfig || {
      name: '1-Day Free Trial',
      durationUnit: 'days',
      durationValue: 1,
      storageBytes: 104857600,
      liveMinutes: 10,
      liveSessionMaxMin: 2,
      deviceLimit: 1,
      features: [
        'No ads',
        '1 Connected device',
        'Live screen mirro',
        'Live video camera',
        'Live Audio',
        'Screenshot schedule and capture silent screenshot',
        'Youtube history and Control',
        'Browser history and control',
        'Live location trakcer',
        'Location history',
        'Driving detection',
        'Call history',
        'contact management',
        'auto call recording',
        'sms message history',
        'App uses and screen time',
        'App mangement block schedule and uses time limit',
        'wifi logger',
        'internet logger',
        'keyword trackker and key logger',
        'all apps Notifications',
        'Remotly rec video audio and screen recording',
        '100 MB storage',
      ],
    };

    const durationUnit = trialOptions.durationUnit || 'days';
    const durationValue = trialOptions.durationValue ?? 1;
    const durationText = durationUnit === 'hours'
      ? `${durationValue} Hour${durationValue > 1 ? 's' : ''}`
      : `${durationValue} Day${durationValue > 1 ? 's' : ''}`;

    const storageBytesVal = trialOptions.storageBytes || 104857600;
    const storageMBVal = Math.round(storageBytesVal / (1024 * 1024));
    const storageDisplay = storageMBVal >= 1024
        ? `${Math.round(storageMBVal / 1024)} GB`
        : `${storageMBVal} MB`;
    const deviceLimit = trialOptions.deviceLimit ?? 1;
    const isTrialUnlimited = deviceLimit >= 1000;
    const liveMinutes = trialOptions.liveMinutes ?? 10;
    const liveSessionMaxMin = trialOptions.liveSessionMaxMin ?? 2;

    const trialConfig = {
      name: trialOptions.name || `${durationText} Free Trial`,
      durationUnit,
      durationValue,
      durationText,
      dayLimit: durationUnit === 'hours' ? Math.ceil(durationValue / 24) : durationValue,
      storageBytes: storageBytesVal,
      storageMB: storageMBVal,
      storageGB: Math.round(storageBytesVal / (1024 * 1024 * 1024)),
      storageText: `${storageDisplay} Trial Storage`,
      liveMinutes,
      liveLimitPerDay: liveMinutes,
      liveSessionMaxMin,
      deviceLimit,
      deviceLimitText: isTrialUnlimited ? 'Unlimited' : `${deviceLimit} Connected Device${deviceLimit > 1 ? 's' : ''}`,
      liveMinutesText: `${liveMinutes} Mins Daily Live`,
      planType: 'trial',
      features: trialOptions.features || [
        'No ads',
        '1 Connected device',
        'Live screen mirro',
        'Live video camera',
        'Live Audio',
        'Screenshot schedule and capture silent screenshot',
        'Youtube history and Control',
        'Browser history and control',
        'Live location trakcer',
        'Location history',
        'Driving detection',
        'Call history',
        'contact management',
        'auto call recording',
        'sms message history',
        'App uses and screen time',
        'App mangement block schedule and uses time limit',
        'wifi logger',
        'internet logger',
        'keyword trackker and key logger',
        'all apps Notifications',
        'Remotly rec video audio and screen recording',
        '100 MB storage',
      ],
    };

    return res.json({
      success: true,
      region: resolvedRegion,
      detectedCountry: rawParam,
      countryListsByRegion,
      dynamicSavePercent,
      plans: formattedPlans,
      addons: formattedAddons,
      storageAddons,
      liveMinutesAddons,
      trialConfig,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const subscribe = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { planId, idempotencyKey, txnId, region, selectedStorageAddonId, selectedLiveAddonId } = req.body;
    if (!planId) return res.status(400).json({ success: false, message: 'planId is required' });

    // Check idempotency
    if (idempotencyKey) {
      const existing = await Subscription.findOne({ parentUserId, idempotencyKey });
      if (existing) {
        return res.json({ success: true, subscription: existing, message: 'Subscription processed' });
      }
    }

    const plan = await Plan.findOne({ planId, isActive: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const options = await ConfigService.getMergedOptions();
    const resolvedRegion = region || 'HIGH_USD';
    const price = plan.priceByRegion[resolvedRegion as keyof typeof plan.priceByRegion] || plan.priceByRegion.HIGH_USD;
    const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';

    const defaultDaysByType = (plan.type === 'yearly' ? 365 : (plan.type === '6_months' || plan.type === 'half_yearly' ? 180 : 30));
    const durationDays = plan.dayLimit || defaultDaysByType;
    const durUnit = ((plan as any).durationUnit || 'days') as DurationUnit;
    const durVal = (plan as any).durationValue > 0 ? (plan as any).durationValue : (plan.dayLimit || defaultDaysByType);
    const durationMs = toMs(durVal, durUnit);
    const backupHours = options.storageBackupAfterExpirPlan || (options.graceDays ? options.graceDays * 24 : 72);

    const liveLimitPerDay = plan.liveLimitPerDay || Math.round((plan.liveMinutesTotal || 30) / 2) || 15;

    const planSnapshot = {
      planId: plan.planId,
      name: plan.name,
      type: plan.type,
      price,
      storageBytes: plan.storageBytes,
      liveMinutesTotal: plan.liveMinutesTotal,
      liveLimitPerDay,
      liveSessionMaxMin: plan.liveSessionMaxMin || 5,
      deviceLimit: plan.deviceLimit,
      dayLimit: durationDays,
      durationMs,
      graceDays: Math.ceil(backupHours / 24),
      storageWarnPercent: options.storageWarnPercent || 80,
      features: plan.features,
    };

    // Check optional add-ons bought in this transaction
    let storageAddonDoc: any = null;
    let liveAddonDoc: any = null;
    if (selectedStorageAddonId) {
      storageAddonDoc = await AddonPlan.findOne({ addonId: selectedStorageAddonId, isActive: true });
    }
    if (selectedLiveAddonId) {
      liveAddonDoc = await AddonPlan.findOne({ addonId: selectedLiveAddonId, isActive: true });
    }

    // Check current subscription for active status & advance queueing (§5 Jio-style)
    const currentSub = await Subscription.findOne({ parentUserId });
    const now = new Date();
    const isCurrentlyActive = currentSub && (currentSub.status === 'active' || currentSub.status === 'trial') && currentSub.expireAt > now;

    const generatedTxnId = txnId || `txn_${Date.now()}`;

    if (isCurrentlyActive) {
      // ════════════════════════════════════════════════════════════
      // ADVANCE / QUEUED PLAN (§5)
      // Queued to activate automatically after current validity ends
      // ════════════════════════════════════════════════════════════
      const queuedPlanData: any = {
        planSnapshot,
        durationDays,
        durationMs,
        txnId: generatedTxnId,
        region: resolvedRegion,
        purchasedAt: now,
      };

      if (storageAddonDoc) {
        const sPrice = storageAddonDoc.priceByRegion[resolvedRegion as keyof typeof storageAddonDoc.priceByRegion] || storageAddonDoc.priceByRegion.HIGH_USD;
        queuedPlanData.storageAddon = {
          addonId: storageAddonDoc.addonId,
          name: storageAddonDoc.name,
          storageBytes: storageAddonDoc.storageBytes,
          price: sPrice,
        };
      }

      if (liveAddonDoc) {
        const lPrice = liveAddonDoc.priceByRegion[resolvedRegion as keyof typeof liveAddonDoc.priceByRegion] || liveAddonDoc.priceByRegion.HIGH_USD;
        queuedPlanData.liveAddon = {
          addonId: liveAddonDoc.addonId,
          name: liveAddonDoc.name,
          liveMinutes: liveAddonDoc.liveMinutes,
          price: lPrice,
        };
      }

      currentSub.queuedPlan = queuedPlanData;
      if (storageAddonDoc) currentSub.lastPurchasedStorageAddonId = storageAddonDoc.addonId;
      if (liveAddonDoc) currentSub.lastPurchasedLiveAddonId = liveAddonDoc.addonId;
      await currentSub.save();

      // Record in Orders Collection
      await Order.create({
        parentUserId,
        type: 'plan',
        planId: plan.planId,
        planLabel: `${plan.name} (Advance Queued)`,
        amount: price,
        currency,
        validityStart: currentSub.expireAt,
        validityEnd: new Date(currentSub.expireAt.getTime() + durationMs),
        txnId: generatedTxnId,
        status: 'queued',
        metadata: { region: resolvedRegion, queued: true, parentTxnId: generatedTxnId, durVal, durUnit, durationMs },
      });

      if (storageAddonDoc) {
        const sPrice = storageAddonDoc.priceByRegion[resolvedRegion as keyof typeof storageAddonDoc.priceByRegion] || storageAddonDoc.priceByRegion.HIGH_USD;
        await Order.create({
          parentUserId,
          type: 'storage_addon',
          addonId: storageAddonDoc.addonId,
          planLabel: `${storageAddonDoc.name} (Advance Queued)`,
          amount: sPrice,
          currency,
          validityStart: currentSub.expireAt,
          validityEnd: new Date(currentSub.expireAt.getTime() + durationMs),
          txnId: `${generatedTxnId}_s_addon`,
          status: 'queued',
          metadata: { parentTxnId: generatedTxnId, region: resolvedRegion, addonType: 'storage' },
        });
      }

      if (liveAddonDoc) {
        const lPrice = liveAddonDoc.priceByRegion[resolvedRegion as keyof typeof liveAddonDoc.priceByRegion] || liveAddonDoc.priceByRegion.HIGH_USD;
        await Order.create({
          parentUserId,
          type: 'live_addon',
          addonId: liveAddonDoc.addonId,
          planLabel: `${liveAddonDoc.name} (Advance Queued)`,
          amount: lPrice,
          currency,
          validityStart: currentSub.expireAt,
          validityEnd: new Date(currentSub.expireAt.getTime() + durationMs),
          txnId: `${generatedTxnId}_l_addon`,
          status: 'queued',
          metadata: { parentTxnId: generatedTxnId, region: resolvedRegion, addonType: 'live_minutes' },
        });
      }

      return res.json({
        success: true,
        isQueued: true,
        subscription: currentSub,
        message: `Your new ${plan.name} has been queued! It will start automatically after your current plan expires on ${currentSub.expireAt.toISOString().split('T')[0]}.`,
      });
    }

    // ════════════════════════════════════════════════════════════
    // IMMEDIATE ACTIVATION / RENEWAL
    // ════════════════════════════════════════════════════════════
    const startAt = now;
    const expireAt = new Date(startAt.getTime() + durationMs);
    const graceEndsAt = new Date(expireAt.getTime() + backupHours * 60 * 60 * 1000);

    let initialAddonStorage = 0;
    let initialAddonLivePool = 0;
    if (storageAddonDoc) {
      initialAddonStorage = storageAddonDoc.storageBytes || 0;
    }
    if (liveAddonDoc) {
      initialAddonLivePool = liveAddonDoc.liveMinutes || 0;
    }

    const subscription = await Subscription.findOneAndUpdate(
      { parentUserId },
      {
        parentUserId,
        status: 'active',
        planSnapshot,
        addonStorageBytes: initialAddonStorage,
        addonLiveMinutesPool: initialAddonLivePool,
        ...(storageAddonDoc ? { lastPurchasedStorageAddonId: storageAddonDoc.addonId } : {}),
        ...(liveAddonDoc ? { lastPurchasedLiveAddonId: liveAddonDoc.addonId } : {}),
        queuedPlan: undefined,
        startAt,
        expireAt,
        graceEndsAt,
        txnId: generatedTxnId,
        idempotencyKey,
        region: resolvedRegion,
        isTrial: false,
      },
      { upsert: true, new: true }
    );

    // Record in Orders Collection
    await Order.create({
      parentUserId,
      type: 'plan',
      planId: plan.planId,
      planLabel: plan.name,
      amount: price,
      currency,
      validityStart: startAt,
      validityEnd: expireAt,
      txnId: generatedTxnId,
      status: 'completed',
      metadata: { region: resolvedRegion, parentTxnId: generatedTxnId, durVal, durUnit, durationMs },
    });

    if (storageAddonDoc) {
      const sPrice = storageAddonDoc.priceByRegion[resolvedRegion as keyof typeof storageAddonDoc.priceByRegion] || storageAddonDoc.priceByRegion.HIGH_USD;
      await Order.create({
        parentUserId,
        type: 'storage_addon',
        addonId: storageAddonDoc.addonId,
        planLabel: storageAddonDoc.name,
        amount: sPrice,
        currency,
        validityStart: startAt,
        validityEnd: expireAt,
        txnId: `${generatedTxnId}_s_addon`,
        status: 'completed',
        metadata: { parentTxnId: generatedTxnId, region: resolvedRegion, addonType: 'storage' },
      });
    }

    if (liveAddonDoc) {
      const lPrice = liveAddonDoc.priceByRegion[resolvedRegion as keyof typeof liveAddonDoc.priceByRegion] || liveAddonDoc.priceByRegion.HIGH_USD;
      await Order.create({
        parentUserId,
        type: 'live_addon',
        addonId: liveAddonDoc.addonId,
        planLabel: liveAddonDoc.name,
        amount: lPrice,
        currency,
        validityStart: startAt,
        validityEnd: expireAt,
        txnId: `${generatedTxnId}_l_addon`,
        status: 'completed',
        metadata: { parentTxnId: generatedTxnId, region: resolvedRegion, addonType: 'live_minutes' },
      });
    }

    // Signal child devices via FCM to resume / upload held grace data (§6 & §7)
    const devices = await Device.find({ parentUserId });
    for (const d of devices) {
      if (d.fcmToken) {
        await sendFcmDataCommand(d.fcmToken, 'SUBSCRIPTION_RESUME', {
          status: 'active',
          expireAt: expireAt.toISOString(),
          graceEndsAt: graceEndsAt.toISOString(),
        }).catch(() => {});
      }
    }

    return res.json({ success: true, isQueued: false, subscription });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const activateTrial = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { phoneNumber, deviceId } = req.body;

    // Check anti-fraud ledger
    const existingLedger = await TrialLedger.findOne({
      $or: [
        ...(phoneNumber ? [{ phoneNumber }] : []),
        ...(deviceId ? [{ deviceId }] : []),
        { parentUserId },
      ],
    });

    if (existingLedger) {
      return res.status(400).json({
        success: false,
        message: 'Free trial has already been used on this phone or device.',
      });
    }

    // Find trial plan from Plan collection (DB plans table)
    const dbTrialPlan = await Plan.findOne({ type: 'trial', isActive: true });
    const trialOptions = dbTrialPlan || {
      name: '1-Day Free Trial',
      durationUnit: 'days',
      durationValue: 1,
      storageBytes: 104857600,
      liveMinutesTotal: 10,
      liveSessionMaxMin: 2,
      deviceLimit: 1,
      features: [
        'No ads',
        '1 Connected device',
        'Live screen mirro',
        'Live video camera',
        'Live Audio',
        'Screenshot schedule and capture silent screenshot',
        'Youtube history and Control',
        'Browser history and control',
        'Live location trakcer',
        'Location history',
        'Driving detection',
        'Call history',
        'contact management',
        'auto call recording',
        'sms message history',
        'App uses and screen time',
        'App mangement block schedule and uses time limit',
        'wifi logger',
        'internet logger',
        'keyword trackker and key logger',
        'all apps Notifications',
        'Remotly rec video audio and screen recording',
        '100 MB storage',
      ],
    };

    const durationUnit = (trialOptions.durationUnit || 'days') as DurationUnit;
    const durationValue = trialOptions.durationValue ?? 1;
    const durationMs = toMs(durationValue, durationUnit);

    const startAt = new Date();
    const expireAt = new Date(startAt.getTime() + durationMs);
    const options = await ConfigService.getMergedOptions();
    const backupHours = options.storageBackupAfterExpirPlan || (options.graceDays ? options.graceDays * 24 : 72);
    const graceEndsAt = new Date(expireAt.getTime() + backupHours * 60 * 60 * 1000);

    const storageBytesVal = trialOptions.storageBytes || 104857600;
    const storageMBVal = Math.round(storageBytesVal / (1024 * 1024));
    const storageDisplay = storageMBVal >= 1024
        ? `${Math.round(storageMBVal / 1024)} GB`
        : `${storageMBVal} MB`;
    const deviceLimit = trialOptions.deviceLimit ?? 1;
    const isTrialUnlimited = deviceLimit >= 1000;
    const liveMinutes = (trialOptions as any).liveMinutes ?? (trialOptions as any).liveMinutesTotal ?? 10;
    const liveSessionMaxMin = trialOptions.liveSessionMaxMin ?? 2;
    const durationText = durationUnit === 'minutes'
      ? `${durationValue} Minute${durationValue > 1 ? 's' : ''}`
      : (durationUnit === 'hours'
          ? `${durationValue} Hour${durationValue > 1 ? 's' : ''}`
          : `${durationValue} Day${durationValue > 1 ? 's' : ''}`);

    const planSnapshot = {
      planId: `trial_free_${durationValue}${durationUnit.charAt(0)}`,
      name: trialOptions.name || `${durationText} Free Trial`,
      type: 'trial',
      price: 0,
      storageBytes: storageBytesVal,
      liveMinutesTotal: liveMinutes,
      liveLimitPerDay: liveMinutes,
      liveSessionMaxMin,
      deviceLimit,
      dayLimit: durationUnit === 'days' ? durationValue : 1,
      durationMs,
      graceDays: Math.ceil(backupHours / 24),
      storageWarnPercent: options.storageWarnPercent || 80,
      features: trialOptions.features || [
        'No ads',
        '1 Connected device',
        'Live screen mirro',
        'Live video camera',
        'Live Audio',
        'Screenshot schedule and capture silent screenshot',
        'Youtube history and Control',
        'Browser history and control',
        'Live location trakcer',
        'Location history',
        'Driving detection',
        'Call history',
        'contact management',
        'auto call recording',
        'sms message history',
        'App uses and screen time',
        'App mangement block schedule and uses time limit',
        'wifi logger',
        'internet logger',
        'keyword trackker and key logger',
        'all apps Notifications',
        'Remotly rec video audio and screen recording',
        '100 MB storage',
      ],
    };

    const txnId = `trial_${Date.now()}`;

    const subscription = await Subscription.findOneAndUpdate(
      { parentUserId },
      {
        parentUserId,
        status: 'trial',
        planSnapshot,
        addonStorageBytes: 0,
        addonLiveMinutesPool: 0,
        queuedPlan: undefined,
        startAt,
        expireAt,
        graceEndsAt,
        txnId,
        region: 'IN_INR',
        isTrial: true,
      },
      { upsert: true, new: true }
    );

    await TrialLedger.create({
      parentUserId,
      phoneNumber,
      deviceId,
      usedAt: new Date(),
    });

    // Record Free Trial in Orders Collection
    await Order.create({
      parentUserId,
      type: 'plan',
      planId: planSnapshot.planId,
      planLabel: planSnapshot.name,
      amount: 0,
      currency: '₹',
      validityStart: startAt,
      validityEnd: expireAt,
      txnId,
      status: 'completed',
      metadata: { isTrial: true },
    });

    return res.json({ success: true, subscription });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const purchaseAddon = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { addonId, region } = req.body;
    const addon = await AddonPlan.findOne({ addonId, isActive: true });
    if (!addon) return res.status(404).json({ success: false, message: 'Addon plan not found' });

    const subscription = await Subscription.findOne({ parentUserId });
    const now = new Date();
    if (!subscription || subscription.status === 'expired' || (subscription.expireAt && subscription.expireAt < now)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot purchase Add-on booster on an expired subscription. Please renew or upgrade your main plan first.',
      });
    }

    const resolvedRegion = region || subscription.region || 'HIGH_USD';
    const price = addon.priceByRegion[resolvedRegion as keyof typeof addon.priceByRegion] || addon.priceByRegion.HIGH_USD;
    const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';

    if (addon.type === 'live_minutes') {
      subscription.addonLiveMinutesPool = (subscription.addonLiveMinutesPool || 0) + (addon.liveMinutes || 0);
      subscription.lastPurchasedLiveAddonId = addon.addonId;
    } else {
      subscription.addonStorageBytes = (subscription.addonStorageBytes || 0) + (addon.storageBytes || 0);
      subscription.lastPurchasedStorageAddonId = addon.addonId;
    }
    await subscription.save();

    const txnId = `txn_addon_${Date.now()}`;
    await Order.create({
      parentUserId,
      type: addon.type === 'live_minutes' ? 'live_addon' : 'storage_addon',
      addonId: addon.addonId,
      planLabel: addon.name,
      amount: price,
      currency,
      validityStart: subscription.startAt || now,
      validityEnd: subscription.expireAt,
      txnId,
      status: 'completed',
    });

    const label = addon.type === 'live_minutes'
      ? `+${addon.liveMinutes} Live Feature Minutes`
      : `+${Math.round(addon.storageBytes / (1024 * 1024 * 1024))} GB Storage`;

    const formattedExpiry = subscription.expireAt ? subscription.expireAt.toISOString().split('T')[0] : 'plan expiry';

    return res.json({
      success: true,
      subscription,
      message: `Successfully added ${label} booster. Booster is valid until main plan expiry on ${formattedExpiry}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const options = await ConfigService.getMergedOptions();
    let subscription = await Subscription.findOne({ parentUserId });

    const backupHours = options.storageBackupAfterExpirPlan || (options.graceDays ? options.graceDays * 24 : 72);

    // If no subscription exists, return subscription: null so app routes to purchase screen or trial can be explicitly activated
    if (!subscription) {
      const storageUsage = await StorageAccountingService.getStorageUsage(parentUserId);
      return res.json({
        success: true,
        subscription: null,
        hasSubscription: false,
        hasQueuedPlan: false,
        queuedPlan: null,
        lastPurchasedStorageAddonId: null,
        lastPurchasedLiveAddonId: null,
        storageUsage,
        liveUsage: {
          dayKey: new Date().toISOString().split('T')[0],
          monthKey: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
          dailyMinutesUsed: 0,
          dailyLimit: 0,
          remainingDailyMinutes: 0,
          addonPool: 0,
          addonMinutesUsed: 0,
          remainingAddonPool: 0,
          totalRemainingLiveMinutes: 0,
        },
        alerts: {
          isStorageWarn: false,
          usagePercent: 0,
          storageWarnPercent: options.storageWarnPercent || 80,
          storageWarnNotificationIntervalMin: options.storageWarnNotificationIntervalMin || 120,
          shouldSendStorageWarnNotify: false,
          isPlanExpired: true,
          isGracePeriodActive: false,
          isGraceExpired: true,
          backupHours,
          graceEndsAt: null,
          hasQueuedPlan: false,
          shouldSendExpireWarnNotify: false,
        },
      });
    }

    const storageUsage = await StorageAccountingService.getStorageUsage(parentUserId);

    const now = new Date();
    const dayKey = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let liveUsageDoc = await LiveUsage.findOne({ parentUserId, dayKey });
    const dailyMinutesUsed = liveUsageDoc ? liveUsageDoc.dailyMinutesUsed : 0;
    const addonMinutesUsed = liveUsageDoc ? liveUsageDoc.addonMinutesUsed : 0;

    // Daily plan limit from snapshot
    const dailyPlanLimit = subscription.planSnapshot?.liveLimitPerDay || 15;
    const addonPool = subscription.addonLiveMinutesPool || 0;

    const remainingDailyMinutes = Math.max(0, dailyPlanLimit - dailyMinutesUsed);
    const remainingAddonPool = Math.max(0, addonPool);
    const totalRemainingLiveMinutes = remainingDailyMinutes + remainingAddonPool;

    // --- Storage Warning Logic ---
    const totalCapacityBytes = (subscription.planSnapshot?.storageBytes || 0) + (subscription.addonStorageBytes || 0);
    const usedBytes = storageUsage?.totalBytes || 0;
    const usagePercent = totalCapacityBytes > 0 ? Math.round((usedBytes / totalCapacityBytes) * 100) : 0;

    const storageWarnPercent = options.storageWarnPercent || 80;
    const storageWarnIntervalMin = options.storageWarnNotificationIntervalMin || 120;
    const isStorageWarn = usagePercent >= storageWarnPercent;

    let shouldSendStorageWarnNotify = false;
    if (isStorageWarn) {
      const lastWarnTime = subscription.lastStorageWarnNotificationAt ? new Date(subscription.lastStorageWarnNotificationAt).getTime() : 0;
      if (now.getTime() - lastWarnTime >= storageWarnIntervalMin * 60 * 1000) {
        shouldSendStorageWarnNotify = true;
        subscription.lastStorageWarnNotificationAt = now;
      }
    }

    // --- Expiration & Grace Period Logic ---
    const expireAtTime = new Date(subscription.expireAt).getTime();
    const graceEndsAtTime = new Date(subscription.graceEndsAt).getTime();

    const isPlanExpired = now.getTime() > expireAtTime;
    const isGracePeriodActive = isPlanExpired && now.getTime() <= graceEndsAtTime;
    const isGraceExpired = isPlanExpired && now.getTime() > graceEndsAtTime;

    // If an advance plan is queued (§5), suppress expiring-soon / expired warnings
    const hasQueuedPlan = Boolean(subscription.queuedPlan && subscription.queuedPlan.planSnapshot);

    // Update status in Mongo if expired/grace
    if (isPlanExpired) {
      if (hasQueuedPlan) {
        // Activate queued plan immediately on status fetch if expired!
        const q = subscription.queuedPlan!;
        const dMs = q.durationMs || toMs(q.durationDays || q.planSnapshot?.dayLimit || 30, 'days');
        const newStartAt = now;
        const newExpireAt = new Date(newStartAt.getTime() + dMs);
        const newGraceEndsAt = new Date(newExpireAt.getTime() + backupHours * 60 * 60 * 1000);

        subscription.status = 'active';
        subscription.planSnapshot = q.planSnapshot;
        subscription.startAt = newStartAt;
        subscription.expireAt = newExpireAt;
        subscription.graceEndsAt = newGraceEndsAt;
        subscription.txnId = q.txnId;
        subscription.isTrial = false;
        if (q.storageAddon) {
          subscription.addonStorageBytes = (subscription.addonStorageBytes || 0) + (q.storageAddon.storageBytes || 0);
          subscription.lastPurchasedStorageAddonId = q.storageAddon.addonId;
        }
        if (q.liveAddon) {
          subscription.addonLiveMinutesPool = (subscription.addonLiveMinutesPool || 0) + (q.liveAddon.liveMinutes || 0);
          subscription.lastPurchasedLiveAddonId = q.liveAddon.addonId;
        }
        subscription.queuedPlan = undefined;
        await subscription.save();
      } else {
        const targetStatus = isGraceExpired ? 'expired' : 'grace';
        if (subscription.status !== targetStatus) {
          subscription.status = targetStatus;
        }
      }
    }

    const expireNotifyIntervalMin = options.expringSoonWarNotificationInterval || options.planValidityExpireNotificationIntervalMin || 120;
    let shouldSendExpireWarnNotify = false;

    if (isPlanExpired && !hasQueuedPlan) {
      const lastExpireNotifyTime = subscription.lastExpireWarnNotificationAt ? new Date(subscription.lastExpireWarnNotificationAt).getTime() : 0;
      if (now.getTime() - lastExpireNotifyTime >= expireNotifyIntervalMin * 60 * 1000) {
        shouldSendExpireWarnNotify = true;
        subscription.lastExpireWarnNotificationAt = now;
      }
    }

    if (shouldSendStorageWarnNotify || shouldSendExpireWarnNotify || subscription.isModified()) {
      await subscription.save();
    }

    return res.json({
      success: true,
      subscription,
      hasQueuedPlan,
      queuedPlan: subscription.queuedPlan,
      lastPurchasedStorageAddonId: subscription.lastPurchasedStorageAddonId,
      lastPurchasedLiveAddonId: subscription.lastPurchasedLiveAddonId,
      storageUsage,
      liveUsage: {
        dayKey,
        monthKey,
        dailyMinutesUsed,
        dailyLimit: dailyPlanLimit,
        remainingDailyMinutes,
        addonPool,
        addonMinutesUsed,
        remainingAddonPool,
        totalRemainingLiveMinutes,
      },
      alerts: {
        isStorageWarn,
        usagePercent,
        storageWarnPercent,
        storageWarnNotificationIntervalMin: storageWarnIntervalMin,
        shouldSendStorageWarnNotify,
        isPlanExpired,
        isGracePeriodActive,
        isGraceExpired,
        backupHours,
        graceEndsAt: subscription.graceEndsAt.toISOString(),
        hasQueuedPlan,
        shouldSendExpireWarnNotify: hasQueuedPlan ? false : shouldSendExpireWarnNotify,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

/**
 * Get Orders / Purchase History for Parent User (§11)
 */
export const getPurchaseHistory = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const rawOrders = await Order.find({ parentUserId }).sort({ createdAt: -1 }).lean();

    // Group addons under their respective parent plan
    const planOrders: any[] = [];
    const standaloneAddons: any[] = [];

    for (const order of rawOrders) {
      if (order.type === 'plan') {
        (order as any).addons = [];
        planOrders.push(order);
      }
    }

    for (const order of rawOrders) {
      if (order.type === 'storage_addon' || order.type === 'live_addon') {
        const parentTxnId = order.metadata?.parentTxnId;
        const matchingPlan = planOrders.find((p) => {
          if (parentTxnId && p.txnId === parentTxnId) return true;
          if (p.txnId && order.txnId && order.txnId.startsWith(p.txnId)) return true;
          if (p.validityEnd && order.validityEnd && new Date(p.validityEnd).getTime() === new Date(order.validityEnd).getTime()) return true;
          return false;
        });

        if (matchingPlan) {
          matchingPlan.addons.push(order);
        } else {
          standaloneAddons.push(order);
        }
      }
    }

    return res.json({
      success: true,
      orders: rawOrders,
      groupedOrders: [...planOrders, ...standaloneAddons],
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

/**
 * Delete Account (Permanent Account & All Data Wipe) (§11)
 */
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    console.warn(`[DELETE-ACCOUNT] Deleting all data and account for parent: ${parentUserId}`);

    // 1. Find all devices connected to this parent
    const devices = await Device.find({ parentUserId });
    for (const dev of devices) {
      try {
        // Erase media in R2 + all 13 Mongo text log collections
        await StorageDeleteService.eraseAllDeviceData(dev.deviceId, parentUserId);

        // Send high-priority wipe & unpair signal to child
        if (dev.fcmToken) {
          await sendFcmDataCommand(dev.fcmToken, 'DELETE_ACCOUNT_WIPE', {
            command: 'UNPAIR_AND_WIPE_LOCAL',
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error(`[DELETE-ACCOUNT-DEVICE-ERROR] ${dev.deviceId}: ${err?.message}`);
      }
    }

    // 2. Remove all devices belonging to parent
    await Device.deleteMany({ parentUserId });

    // 3. Remove Subscription, LiveUsage, StorageUsage, Orders (Keep TrialLedger forever for anti-fraud)
    await Subscription.deleteMany({ parentUserId });
    await LiveUsage.deleteMany({ parentUserId });
    await StorageUsage.deleteMany({ parentUserId });
    await Order.deleteMany({ parentUserId });

    // 4. Remove User record
    await User.findByIdAndDelete(parentUserId);

    return res.json({
      success: true,
      message: 'Your account and all associated data, media, device connections, and history have been permanently deleted.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const getAutoDeleteConfig = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    let user = await User.findById(parentUserId);
    if (!user) {
      user = await User.findOne({ _id: parentUserId });
    }

    const devices = await Device.find({ parentUserId: user?._id || parentUserId });
    const perDevice: Record<string, any> = {};
    for (const dev of devices) {
      perDevice[dev.deviceId] = {
        deviceId: dev.deviceId,
        deviceName: dev.deviceName || dev.deviceModel || 'Child Device',
        isEnabled: dev.autoDeleteIsEnabled ?? user?.autoDeleteIsEnabled ?? false,
        minutesOption: dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? 10080,
        daysOption: dev.autoDeleteDays ?? Math.ceil((dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? 10080) / 1440),
        categoriesSelected: (dev.autoDeleteCategories && dev.autoDeleteCategories.length > 0)
          ? dev.autoDeleteCategories
          : (user?.autoDeleteCategories ?? ['all']),
      };
    }

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? 10080,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? 10080) / 1440),
      categoriesSelected: user?.autoDeleteCategories ?? ['all'],
      deviceIdsSelected: user?.autoDeleteDeviceIds ?? [],
      perDevice,
    };
    return res.json({ success: true, autoDelete, perDevice });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const updateAutoDeleteConfig = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { deviceId, isEnabled, minutesOption, daysOption, categoriesSelected, deviceIdsSelected, selectedDeviceIds } = req.body;
    const mins = minutesOption || (daysOption ? daysOption * 1440 : 10080);
    const targetDeviceIds = deviceIdsSelected || selectedDeviceIds;

    let user = await User.findById(parentUserId);
    if (!user) {
      user = await User.findOne({ _id: parentUserId });
    }

    // 1. If deviceId specified, save settings strictly for this device
    if (deviceId) {
      await Device.findOneAndUpdate(
        { deviceId, parentUserId: user?._id || parentUserId },
        {
          $set: {
            autoDeleteIsEnabled: isEnabled !== undefined ? isEnabled : false,
            autoDeleteMinutes: mins,
            autoDeleteDays: Math.ceil(mins / 1440),
            autoDeleteCategories: categoriesSelected || ['all'],
          },
        },
        { new: true }
      );
    } else if (targetDeviceIds && Array.isArray(targetDeviceIds) && targetDeviceIds.length > 0) {
      // 2. If targetDeviceIds array specified, update those devices
      await Device.updateMany(
        { deviceId: { $in: targetDeviceIds }, parentUserId: user?._id || parentUserId },
        {
          $set: {
            autoDeleteIsEnabled: isEnabled !== undefined ? isEnabled : false,
            autoDeleteMinutes: mins,
            autoDeleteDays: Math.ceil(mins / 1440),
            autoDeleteCategories: categoriesSelected || ['all'],
          },
        }
      );
    }

    // 3. Also update User level default settings
    const updateData: any = {
      autoDeleteIsEnabled: isEnabled !== undefined ? isEnabled : false,
      autoDeleteMinutes: mins,
      autoDeleteDays: Math.ceil(mins / 1440),
      autoDeleteCategories: categoriesSelected || ['all'],
    };
    if (targetDeviceIds !== undefined) {
      updateData.autoDeleteDeviceIds = targetDeviceIds;
    }

    user = await User.findByIdAndUpdate(
      parentUserId,
      updateData,
      { new: true }
    );

    if (isEnabled) {
      await StorageDeleteService.executeParentAutoDeletePurge(parentUserId, deviceId);
    }

    const devices = await Device.find({ parentUserId: user?._id || parentUserId });
    const perDevice: Record<string, any> = {};
    for (const dev of devices) {
      perDevice[dev.deviceId] = {
        deviceId: dev.deviceId,
        deviceName: dev.deviceName || dev.deviceModel || 'Child Device',
        isEnabled: dev.autoDeleteIsEnabled ?? user?.autoDeleteIsEnabled ?? false,
        minutesOption: dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? 10080,
        daysOption: dev.autoDeleteDays ?? Math.ceil((dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? 10080) / 1440),
        categoriesSelected: (dev.autoDeleteCategories && dev.autoDeleteCategories.length > 0)
          ? dev.autoDeleteCategories
          : (user?.autoDeleteCategories ?? ['all']),
      };
    }

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? 10080,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? 10080) / 1440),
      categoriesSelected: user?.autoDeleteCategories ?? ['all'],
      deviceIdsSelected: user?.autoDeleteDeviceIds ?? [],
      perDevice,
    };

    return res.json({ success: true, autoDelete, perDevice });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};
