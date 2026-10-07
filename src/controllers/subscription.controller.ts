import { Request, Response } from 'express';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { Subscription } from '../models/Subscription';
import { TrialLedger } from '../models/TrialLedger';
import { StorageUsage } from '../models/StorageUsage';
import { LiveUsage } from '../models/LiveUsage';
import { User } from '../models/User';
import { ConfigService } from '../services/ConfigService';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { StorageDeleteService } from '../services/StorageDeleteService';

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

    // Seed default plans if DB empty
    const count = await Plan.countDocuments();
    if (count === 0) {
      await Plan.create([
        {
          planId: 'plan_starter_monthly',
          name: 'Starter Monthly',
          type: 'monthly',
          priceByRegion: { IN_INR: 199, LOW_USD: 2.99, HIGH_USD: 5.99 },
          storageBytes: 5368709120, // 5 GB
          dayLimit: 30,
          liveMinutesTotal: 30,
          liveSessionMaxMin: 5,
          deviceLimit: 1,
          features: [
            '5 GB Cloud Storage',
            '1 Connected Device',
            '30 Live Minutes / Month',
            'Wi-Fi & Browsing History',
            'Live Camera & Audio Streaming',
            'Live Screen Mirroring',
            'Location & Geofence Alerts',
            'Call & SMS Tracking',
            'Keyword Tracker & Keylogger',
          ],
          isActive: true,
          sortOrder: 1,
        },
        {
          planId: 'plan_pro_monthly',
          name: 'Pro Family Monthly',
          type: 'monthly',
          priceByRegion: { IN_INR: 399, LOW_USD: 5.99, HIGH_USD: 11.99 },
          storageBytes: 21474836480, // 20 GB
          dayLimit: 30,
          liveMinutesTotal: 120,
          liveSessionMaxMin: 5,
          deviceLimit: 3,
          features: [
            '20 GB Cloud Storage',
            '3 Connected Devices',
            '120 Live Minutes / Month',
            'Wi-Fi & Browsing History',
            'Live Camera & Audio Streaming',
            'Live Screen Mirroring',
            'Location & Geofence Alerts',
            'Call & SMS Tracking',
            'Keyword Tracker & Keylogger',
            'Priority Support',
          ],
          isActive: true,
          isRecommended: true,
          sortOrder: 2,
        },
        {
          planId: 'plan_pro_yearly',
          name: 'Pro Family Yearly',
          type: 'yearly',
          priceByRegion: { IN_INR: 2999, LOW_USD: 49.99, HIGH_USD: 99.99 },
          storageBytes: 53687091200, // 50 GB
          dayLimit: 365,
          liveMinutesTotal: 1500,
          liveSessionMaxMin: 5,
          deviceLimit: 5,
          features: [
            '50 GB Cloud Storage',
            '5 Connected Devices',
            '1500 Live Minutes / Month',
            'Wi-Fi & Browsing History',
            'Live Camera & Audio Streaming',
            'Live Screen Mirroring',
            'Location & Geofence Alerts',
            'Call & SMS Tracking',
            'Keyword Tracker & Keylogger',
            'Best Value (Save over 35%)',
          ],
          isActive: true,
          sortOrder: 3,
        },
      ]);
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

    const formattedPlans = plans.map((p) => {
      const price = p.priceByRegion[resolvedRegion as keyof typeof p.priceByRegion] || p.priceByRegion.HIGH_USD;
      const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';
      const perMonthPrice = p.type === 'yearly' ? Math.round((price / 12) * 100) / 100 : price;
      const storageGB = Math.round(p.storageBytes / (1024 * 1024 * 1024));
      return {
        ...p,
        resolvedPrice: price,
        currency,
        perMonthPrice,
        storageGB,
        deviceLimitText: `${p.deviceLimit} Connected Device${p.deviceLimit > 1 ? 's' : ''}`,
        liveMinutesText: `${p.liveMinutesTotal} Live Mins`,
        featuresList: p.features,
        region: resolvedRegion,
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
      name: '3-Day Free Trial',
      durationUnit: 'days',
      durationValue: 3,
      storageBytes: 2147483648,
      liveMinutes: 15,
      deviceLimit: 1,
    };

    const durationUnit = trialOptions.durationUnit || 'days';
    const durationValue = trialOptions.durationValue ?? 3;
    const durationText = durationUnit === 'hours'
      ? `${durationValue} Hour${durationValue > 1 ? 's' : ''}`
      : `${durationValue} Day${durationValue > 1 ? 's' : ''}`;

    const storageGB = Math.round((trialOptions.storageBytes || 2147483648) / (1024 * 1024 * 1024));
    const deviceLimit = trialOptions.deviceLimit ?? 1;
    const liveMinutes = trialOptions.liveMinutes ?? 15;

    const trialConfig = {
      name: trialOptions.name || `${durationText} Free Trial`,
      durationUnit,
      durationValue,
      durationText,
      storageBytes: trialOptions.storageBytes || 2147483648,
      storageGB,
      liveMinutes,
      deviceLimit,
      deviceLimitText: `${deviceLimit} Connected Device${deviceLimit > 1 ? 's' : ''}`,
      liveMinutesText: `${liveMinutes} Live Mins`,
      features: trialOptions.features || [
        `${storageGB} GB Trial Storage`,
        `${deviceLimit} Connected Device${deviceLimit > 1 ? 's' : ''}`,
        `${liveMinutes} Live Mins`,
        `${durationText} Free Access`,
      ],
    };

    return res.json({
      success: true,
      region: resolvedRegion,
      detectedCountry: rawParam,
      countryListsByRegion,
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

    const { planId, idempotencyKey, txnId, region } = req.body;
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

    const startAt = new Date();
    const durationDays = plan.dayLimit || 30;
    const expireAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const graceDays = options.graceDays || 3;
    const graceEndsAt = new Date(expireAt.getTime() + graceDays * 24 * 60 * 60 * 1000);

    const planSnapshot = {
      planId: plan.planId,
      name: plan.name,
      type: plan.type,
      price,
      storageBytes: plan.storageBytes,
      liveMinutesTotal: plan.liveMinutesTotal,
      liveSessionMaxMin: plan.liveSessionMaxMin,
      deviceLimit: plan.deviceLimit,
      graceDays,
      storageWarnPercent: options.storageWarnPercent || 80,
      features: plan.features,
    };

    const subscription = await Subscription.findOneAndUpdate(
      { parentUserId },
      {
        parentUserId,
        status: 'active',
        planSnapshot,
        startAt,
        expireAt,
        graceEndsAt,
        txnId: txnId || `txn_${Date.now()}`,
        idempotencyKey,
        region: resolvedRegion,
        isTrial: false,
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, subscription });
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

    const options = await ConfigService.getMergedOptions();
    const trialOptions = options.trialPlanConfig || {
      name: '3-Day Free Trial',
      durationUnit: 'days',
      durationValue: 3,
      storageBytes: 2147483648,
      liveMinutes: 15,
      deviceLimit: 1,
    };

    const durationUnit = trialOptions.durationUnit || 'days';
    const durationValue = trialOptions.durationValue ?? 3;
    const durationMs = durationUnit === 'hours'
      ? durationValue * 60 * 60 * 1000
      : durationValue * 24 * 60 * 60 * 1000;

    const startAt = new Date();
    const expireAt = new Date(startAt.getTime() + durationMs);
    const graceDays = options.graceDays || 3;
    const graceEndsAt = new Date(expireAt.getTime() + graceDays * 24 * 60 * 60 * 1000);

    const storageGB = Math.round((trialOptions.storageBytes || 2147483648) / (1024 * 1024 * 1024));
    const deviceLimit = trialOptions.deviceLimit ?? 1;
    const liveMinutes = trialOptions.liveMinutes ?? 15;
    const durationText = durationUnit === 'hours'
      ? `${durationValue} Hour${durationValue > 1 ? 's' : ''}`
      : `${durationValue} Day${durationValue > 1 ? 's' : ''}`;

    const planSnapshot = {
      planId: `trial_free_${durationValue}${durationUnit.charAt(0)}`,
      name: trialOptions.name || `${durationText} Free Trial`,
      type: 'monthly',
      price: 0,
      storageBytes: trialOptions.storageBytes || 2147483648,
      liveMinutesTotal: liveMinutes,
      liveSessionMaxMin: options.liveSessionMaxMin || 5,
      deviceLimit,
      graceDays,
      storageWarnPercent: options.storageWarnPercent || 80,
      features: trialOptions.features || [
        `${storageGB} GB Trial Storage`,
        `${deviceLimit} Connected Device${deviceLimit > 1 ? 's' : ''}`,
        `${liveMinutes} Live Mins`,
        `${durationText} Free Access`,
      ],
    };

    const subscription = await Subscription.findOneAndUpdate(
      { parentUserId },
      {
        parentUserId,
        status: 'trial',
        planSnapshot,
        startAt,
        expireAt,
        graceEndsAt,
        txnId: `trial_${Date.now()}`,
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

    return res.json({ success: true, subscription });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const purchaseAddon = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { addonId } = req.body;
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

    if (addon.type === 'live_minutes') {
      subscription.planSnapshot.liveMinutesTotal = (subscription.planSnapshot.liveMinutesTotal || 0) + (addon.liveMinutes || 0);
      subscription.markModified('planSnapshot');
    } else {
      subscription.addonStorageBytes = (subscription.addonStorageBytes || 0) + (addon.storageBytes || 0);
    }
    await subscription.save();

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

    // Auto seed free trial for new parents if none exists
    if (!subscription) {
      const trialDays = 3;
      const startAt = new Date();
      const expireAt = new Date(startAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const graceDays = options.graceDays || 3;
      const graceEndsAt = new Date(expireAt.getTime() + graceDays * 24 * 60 * 60 * 1000);

      subscription = await Subscription.create({
        parentUserId,
        status: 'trial',
        planSnapshot: {
          planId: 'trial_free_3d',
          name: '3 Days Free Trial',
          type: 'monthly',
          price: 0,
          storageBytes: 2147483648,
          liveMinutesTotal: 15,
          liveSessionMaxMin: 5,
          deviceLimit: 1,
          graceDays,
          storageWarnPercent: options.storageWarnPercent || 80,
          features: ['2 GB Trial Storage', '1 Device', '15 Live Mins'],
        },
        startAt,
        expireAt,
        graceEndsAt,
        isTrial: true,
      });
    }

    const storageUsage = await StorageAccountingService.getStorageUsage(parentUserId);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let liveUsageDoc = await LiveUsage.findOne({ parentUserId, monthKey });
    const liveMinutesUsed = liveUsageDoc ? liveUsageDoc.minutesUsed : 0;

    // --- Storage Warning Logic (above storageWarnPercent %, e.g., 80%) ---
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
    const graceDays = options.graceDays || 3;
    const expireAtTime = new Date(subscription.expireAt).getTime();
    const graceEndsAtTime = expireAtTime + graceDays * 24 * 60 * 60 * 1000;
    const graceEndsAt = new Date(graceEndsAtTime);

    const isPlanExpired = now.getTime() > expireAtTime;
    const isGracePeriodActive = isPlanExpired && now.getTime() <= graceEndsAtTime;
    const isGraceExpired = isPlanExpired && now.getTime() > graceEndsAtTime;

    // Update status in Mongo if expired/grace
    if (isPlanExpired) {
      const targetStatus = isGraceExpired ? 'expired' : 'grace';
      if (subscription.status !== targetStatus) {
        subscription.status = targetStatus;
      }
    }

    const expireNotifyIntervalMin = options.planValidityExpireNotificationIntervalMin || 120;
    let shouldSendExpireWarnNotify = false;

    if (isPlanExpired) {
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
      storageUsage,
      liveUsage: {
        monthKey,
        minutesUsed: liveMinutesUsed,
        minutesTotal: subscription.planSnapshot.liveMinutesTotal || 60,
        remainingMinutes: Math.max(0, (subscription.planSnapshot.liveMinutesTotal || 60) - liveMinutesUsed),
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
        graceDays,
        graceEndsAt: graceEndsAt.toISOString(),
        planValidityExpireNotificationIntervalMin: expireNotifyIntervalMin,
        shouldSendExpireWarnNotify,
      },
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

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? 10080,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? 10080) / 1440),
      categoriesSelected: user?.autoDeleteCategories ?? ['all'],
      deviceIdsSelected: user?.autoDeleteDeviceIds ?? [],
    };
    return res.json({ success: true, autoDelete });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const updateAutoDeleteConfig = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { isEnabled, minutesOption, daysOption, categoriesSelected, deviceIdsSelected, selectedDeviceIds } = req.body;
    const mins = minutesOption || (daysOption ? daysOption * 1440 : 10080);
    const targetDeviceIds = deviceIdsSelected || selectedDeviceIds;

    const updateData: any = {
      autoDeleteIsEnabled: isEnabled !== undefined ? isEnabled : false,
      autoDeleteMinutes: mins,
      autoDeleteDays: Math.ceil(mins / 1440),
      autoDeleteCategories: categoriesSelected || ['all'],
    };
    if (targetDeviceIds !== undefined) {
      updateData.autoDeleteDeviceIds = targetDeviceIds;
    }

    const user = await User.findByIdAndUpdate(
      parentUserId,
      updateData,
      { new: true }
    );

    if (user && user.autoDeleteIsEnabled) {
      // Execute immediate purge of existing data older than selected interval
      await StorageDeleteService.executeParentAutoDeletePurge(parentUserId);
    }

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? 10080,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? 10080) / 1440),
      categoriesSelected: user?.autoDeleteCategories ?? ['all'],
      deviceIdsSelected: user?.autoDeleteDeviceIds ?? [],
    };

    return res.json({ success: true, autoDelete });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};
