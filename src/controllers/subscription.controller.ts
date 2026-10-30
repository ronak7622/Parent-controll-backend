import { normalizeEmail } from '../utils/normalizeEmail';
import { isDisposableEmail } from '../utils/disposableEmail';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { Subscription } from '../models/Subscription';
import { TrialLedger } from '../models/TrialLedger';
import { StorageUsage } from '../models/StorageUsage';
import { LiveUsage } from '../models/LiveUsage';
import { User } from '../models/User';
import { deleteFirebaseUser, deleteFirebaseUserByEmail } from '../services/firebaseAuth.service';
import { getCloudflareTurnIceServers } from '../services/cloudflareTurn.service';
import { Device } from '../models/Device';
import { Order } from '../models/Order';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';
import { Contact } from '../models/Contact';
import { ScheduleConfig } from '../models/ScheduleConfig';
import { DeletedRecording } from '../models/DeletedRecording';
import { ConfigService } from '../services/ConfigService';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { StorageDeleteService } from '../services/StorageDeleteService';
import { LiveUsageService } from '../services/LiveUsageService';
import { sendFcmDataCommand } from '../services/fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { cacheService } from '../services/cache.service';
import { toMs, DurationUnit } from '../utils/duration';
// plansI18n imported ONLY for seeding/migration – NOT used in request response path
import { PLAN_NAMES_I18N, ADDON_NAMES_I18N, localizeFeatureItem } from '../config/plansI18n';

/**
 * Permanently records a parent user, phone number, and/or device ID into TrialLedger
 * so that a Free Trial can never be offered or claimed again once any plan or trial is consumed.
 */
async function recordTrialOrPlanUsage(parentUserId?: string, phoneInput?: string, deviceIdInput?: string, emailInput?: string) {
  try {
    let phoneNumber = (phoneInput || '').trim();
    let rawEmail = (emailInput || '').trim().toLowerCase();
    let normEmail = rawEmail ? normalizeEmail(rawEmail) : '';

    if ((!phoneNumber || !normEmail) && parentUserId && mongoose.isValidObjectId(parentUserId)) {
      const u = await User.findById(parentUserId).lean();
      if (!phoneNumber && u?.phoneNumber) {
        phoneNumber = u.phoneNumber.trim();
      }
      if (!rawEmail && u?.email) {
        rawEmail = u.email.trim().toLowerCase();
        normEmail = normalizeEmail(rawEmail);
      }
    }

    if (phoneNumber || parentUserId || deviceIdInput || normEmail || rawEmail) {
      await TrialLedger.findOneAndUpdate(
        {
          $or: [
            ...(normEmail ? [{ normalizedEmail: normEmail }] : []),
            ...(rawEmail ? [{ email: rawEmail }] : []),
            ...(phoneNumber ? [{ phoneNumber }] : []),
            ...(deviceIdInput ? [{ deviceId: deviceIdInput }] : []),
            ...(parentUserId ? [{ parentUserId }] : []),
          ],
        },
        {
          ...(parentUserId ? { parentUserId } : {}),
          ...(phoneNumber ? { phoneNumber } : {}),
          ...(rawEmail ? { email: rawEmail } : {}),
          ...(normEmail ? { normalizedEmail: normEmail } : {}),
          ...(deviceIdInput ? { deviceId: deviceIdInput } : {}),
          usedAt: new Date(),
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.warn('[TrialLedger] Warning recording trial or plan usage:', err);
  }
}

export const getOptionsConfig = async (req: Request, res: Response) => {
  try {
    const rawLang = ((req.query.lang || req.headers['accept-language'] || (req as any).user?.languageCode || 'en') as string);
    const lang = rawLang.split(',')[0].split('-')[0].trim().toLowerCase();
    const options = await ConfigService.getLocalizedOptions(lang);
    try {
      const turn = await getCloudflareTurnIceServers();
      if (turn.length > 0) {
        const stun = (options.iceServers || []).filter((s: any) => String(s.urls).startsWith('stun:'));
        options.iceServers = [...stun, ...turn];
      }
    } catch (_) {}
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

    // Seed default plans if DB empty or trial plan needs field update
    const trialPlanExists = await Plan.findOne({ planId: 'plan_1_day_trial' });
    if (!trialPlanExists || trialPlanExists.planDurationValueInMinute === undefined) {
      const LANGS = ['en', 'hi', 'gu', 'es', 'fr'] as const;
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

      // Build per-language nameI18n and featuresI18n maps for seeding
      const buildI18n = (planId: string, enFeatures: string[]) => ({
        nameI18n: Object.fromEntries(LANGS.map(l => [l, PLAN_NAMES_I18N[planId]?.[l] || ''])),
        featuresI18n: Object.fromEntries(LANGS.map(l => [
          l,
          enFeatures.map(f => l === 'en' ? f : localizeFeatureItem(f, l)),
        ])),
      });

      const trialFeatures = makeFeatures('1 device connect', '100 mb storage');
      const paidFeatures = makeFeatures('Unlimited device connect', '20 gb storage');

      const defaultPlans = [
        {
          planId: 'plan_1_day_trial',
          name: '1 Day Free Trial',
          type: 'trial',
          priceByRegion: { IN_INR: 0, LOW_USD: 0, HIGH_USD: 0 },
          storageBytes: 104857600, // 100 MB
          planDurationValueInMinute: 1440,
          planDurationUnit: 'minutes',
          graceTimeInMinute: 4320,
          planPriceDiscountPercen: 0,
          liveLimitTotalInMinute: 10,
          liveLimitPerDayInMinutes: 10,
          deviceLimit: 1,
          features: trialFeatures,
          ...buildI18n('plan_1_day_trial', trialFeatures),
          isActive: true,
          isRecommended: false,
          sortOrder: 0,
          isAllowSocialAppChatHistory: false,
        },
        {
          planId: 'plan_1_month',
          name: '1 Month Plan',
          type: 'monthly',
          priceByRegion: { IN_INR: 1000, LOW_USD: 14.99, HIGH_USD: 24.99 },
          storageBytes: 21474836480, // 20 GB
          planDurationValueInMinute: 43200,
          planDurationUnit: 'minutes',
          graceTimeInMinute: 4320,
          planPriceDiscountPercen: 0,
          liveLimitTotalInMinute: 1800,
          liveLimitPerDayInMinutes: 60,
          deviceLimit: 1000, // Unlimited
          features: paidFeatures,
          ...buildI18n('plan_1_month', paidFeatures),
          isActive: true,
          sortOrder: 1,
          isAllowSocialAppChatHistory: true,
        },
        {
          planId: 'plan_6_months',
          name: '6 Months Plan',
          type: '6_months',
          priceByRegion: { IN_INR: 2500, LOW_USD: 34.99, HIGH_USD: 59.99 },
          storageBytes: 21474836480, // 20 GB
          planDurationValueInMinute: 259200,
          planDurationUnit: 'minutes',
          graceTimeInMinute: 4320,
          planPriceDiscountPercen: 15,
          liveLimitTotalInMinute: 10800,
          liveLimitPerDayInMinutes: 60,
          deviceLimit: 1000, // Unlimited
          features: paidFeatures,
          ...buildI18n('plan_6_months', paidFeatures),
          isActive: true,
          isRecommended: false,
          sortOrder: 2,
          isAllowSocialAppChatHistory: true,
        },
        {
          planId: 'plan_1_year',
          name: '1 Year Plan',
          type: 'yearly',
          priceByRegion: { IN_INR: 2000, LOW_USD: 29.99, HIGH_USD: 49.99 },
          storageBytes: 21474836480, // 20 GB
          planDurationValueInMinute: 525600,
          planDurationUnit: 'minutes',
          graceTimeInMinute: 4320,
          planPriceDiscountPercen: 35,
          liveLimitTotalInMinute: 21900,
          liveLimitPerDayInMinutes: 60,
          deviceLimit: 1000, // Unlimited
          features: paidFeatures,
          ...buildI18n('plan_1_year', paidFeatures),
          isActive: true,
          isRecommended: true,
          sortOrder: 3,
          isAllowSocialAppChatHistory: true,
        },
      ];

      for (const p of defaultPlans) {
        await Plan.findOneAndUpdate({ planId: p.planId }, { $set: p, $unset: { dayLimit: 1, liveSessionMaxMin: 1 } }, { upsert: true, new: true });
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

    const rawDeviceId = req.headers['x-device-id'] || req.headers['device-id'] || req.headers['x-device-uuid'] || req.query.deviceId || req.body?.deviceId || '';
    const deviceId = (typeof rawDeviceId === 'string' ? rawDeviceId : Array.isArray(rawDeviceId) ? rawDeviceId[0] : '').trim();

    let phone = String((req as any).user?.phoneNumber || (req as any).user?.phone || req.query.phoneNumber || req.body?.phoneNumber || '').trim();
    let email = String((req as any).user?.email || req.query.email || req.body?.email || '').trim().toLowerCase();
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id || (req.query.parentUserId as string);

    if ((!phone || !email) && parentUserId && mongoose.isValidObjectId(parentUserId)) {
      const u = await User.findById(parentUserId).lean();
      if (!phone && u?.phoneNumber) {
        phone = u.phoneNumber.trim();
      }
      if (!email && u?.email) {
        email = u.email.trim().toLowerCase();
      }
    }

    const normEmail = email ? normalizeEmail(email) : '';

    let trialUsed = false;
    if (parentUserId || phone || deviceId || normEmail || email) {
      const existingLedger = await TrialLedger.findOne({
        $or: [
          ...(normEmail ? [{ normalizedEmail: normEmail }] : []),
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phoneNumber: phone }] : []),
          ...(deviceId ? [{ deviceId }] : []),
          ...(parentUserId ? [{ parentUserId }] : []),
        ],
      });
      if (existingLedger) {
        trialUsed = true;
        // Permanently link current identifiers in TrialLedger
        recordTrialOrPlanUsage(parentUserId, phone, deviceId, email).catch(() => {});
      }
    }

    // If not found in ledger yet, but parent already has or had a subscription or order,
    // mark trial as used and backfill into TrialLedger immediately:
    if (!trialUsed) {
      const parentUserIdsToCheck: string[] = [];
      if (parentUserId) parentUserIdsToCheck.push(parentUserId);
      if (email) {
        const matchingUsers = await User.find({ email }).select('_id').lean();
        matchingUsers.forEach(mu => parentUserIdsToCheck.push(mu._id.toString()));
      }
      if (parentUserIdsToCheck.length > 0) {
        const [existingSub, existingOrder] = await Promise.all([
          Subscription.findOne({ parentUserId: { $in: parentUserIdsToCheck } }).lean(),
          Order.findOne({ parentUserId: { $in: parentUserIdsToCheck } }).lean(),
        ]);
        if (existingSub || existingOrder) {
          trialUsed = true;
          recordTrialOrPlanUsage(parentUserId, phone, deviceId, email).catch(() => {});
        }
      }
    }

    const canSeeTest = ((options as any).testPlanPhones || []).includes(phone) || ((options as any).testPlanEmails || []).includes(email);
    const visiblePlans = plans.filter((p) => (canSeeTest || !(p as any).isTestPlan) && (!trialUsed || p.type !== 'trial'));

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

    const rawLang = ((req.query.lang || req.headers['accept-language'] || (req as any).user?.languageCode || 'en') as string);
    const cleanLang = rawLang.split(',')[0].split('-')[0].trim().toLowerCase();

    const formattedPlans = visiblePlans.map((p: any) => {
      const price = p.priceByRegion[resolvedRegion as keyof typeof p.priceByRegion] || p.priceByRegion.HIGH_USD;
      const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';
      const durationMinutes = p.planDurationValueInMinute || (p.dayLimit ? p.dayLimit * 1440 : (p.type === 'yearly' ? 525600 : (p.type === '6_months' || p.type === 'half_yearly' ? 259200 : 43200)));
      const days = Math.round(durationMinutes / 1440);
      // Read localized name and features directly from DB fields (DB is the source of truth)
      const localizedName = (p.nameI18n as any)?.[cleanLang] || p.name;
      const localizedFeatures: string[] = (p.featuresI18n as any)?.[cleanLang] || p.features || [];
      
      // Calculate effective monthly price dynamically based on actual plan duration
      let months = days / 30;
      if (months < 1) months = 1;
      const perMonthPrice = months > 1 ? Math.round((price / months) * 100) / 100 : price;
      
      const storageGB = Math.round(p.storageBytes / (1024 * 1024 * 1024));
      const isUnlimitedDevices = (p.deviceLimit || 0) >= 1000;
      const livePerDay = p.liveLimitPerDayInMinutes || p.liveLimitPerDay || 60;
      const liveTotal = p.liveLimitTotalInMinute || p.liveMinutesTotal || (livePerDay * days);
      const discountPercen = p.planPriceDiscountPercen !== undefined ? p.planPriceDiscountPercen : (p.type === 'yearly' ? dynamicSavePercent : 0);

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
        name: localizedName,
        features: localizedFeatures,
        featuresList: localizedFeatures,
        resolvedPrice: price,
        currency,
        perMonthPrice,
        storageGB,
        planDurationValueInMinute: durationMinutes,
        planDurationUnit: p.planDurationUnit || 'minutes',
        graceTimeInMinute: p.graceTimeInMinute || 4320,
        planPriceDiscountPercen: discountPercen,
        liveLimitTotalInMinute: liveTotal,
        liveLimitPerDayInMinutes: livePerDay,
        liveSessionMaxMin: options.liveSessionMaxMin || 5,
        liveLimitPerDay: livePerDay,
        liveMinutesTotal: liveTotal,
        deviceLimit: p.deviceLimit,
        deviceLimitText: isUnlimitedDevices ? 'Unlimited' : `${p.deviceLimit} Connected Device${p.deviceLimit > 1 ? 's' : ''}`,
        liveMinutesText: `${livePerDay} Mins Daily Live`,
        dayLimit: days,
        region: resolvedRegion,
        billingCycleText,
        dynamicSavePercent: discountPercen,
      };
    });

    const formattedAddons = addons.map((a) => {
      const price = a.priceByRegion[resolvedRegion as keyof typeof a.priceByRegion] || a.priceByRegion.HIGH_USD;
      const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';
      const storageGB = a.storageBytes ? Math.round(a.storageBytes / (1024 * 1024 * 1024)) : 0;
      // Read localized addon name from DB field; fall back to static dict then base name
      const localizedAddonName = (a as any).nameI18n?.[cleanLang] || ADDON_NAMES_I18N[a.addonId]?.[cleanLang] || a.name;
      return {
        ...a,
        name: localizedAddonName,
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

    // Prefer per-language features from trial plan's DB featuresI18n field
    const trialDbPlan = visiblePlans.find((p: any) => p.type === 'trial') as any;
    const trialFeaturesRaw: string[] = trialOptions.features || [
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
    ];
    // Use DB featuresI18n if available (DB-driven), otherwise fall back to localizeFeatureItem
    const trialFeatures: string[] = trialDbPlan?.featuresI18n?.[cleanLang] ||
      trialFeaturesRaw.map((f: string) => localizeFeatureItem(f, cleanLang));

    const trialConfig = {
      // Prefer DB nameI18n, then static dict, then base name
      name: trialDbPlan?.nameI18n?.[cleanLang] || PLAN_NAMES_I18N['plan_1_day_trial']?.[cleanLang] || trialOptions.name || `${durationText} Free Trial`,
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
      deviceLimit,
      deviceLimitText: isTrialUnlimited ? 'Unlimited' : `${deviceLimit} Connected Device${deviceLimit > 1 ? 's' : ''}`,
      liveMinutesText: `${liveMinutes} Mins Daily Live`,
      planType: 'trial',
      features: trialFeatures,
    };

    let hasQueuedPlan = false;
    let queuedPlan: any = null;
    let activePlanExpireAt: string | null = null;
    if (parentUserId) {
      const parentSub = await Subscription.findOne({ parentUserId }).lean();
      if (parentSub && (parentSub as any).queuedPlan && (parentSub as any).queuedPlan.planSnapshot) {
        hasQueuedPlan = true;
        queuedPlan = (parentSub as any).queuedPlan;
        activePlanExpireAt = parentSub.expireAt ? parentSub.expireAt.toISOString() : null;
      }
    }

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
      trialUsed,
      trialEligible: !trialUsed,
      trialConfig: trialUsed ? null : trialConfig,
      hasQueuedPlan,
      queuedPlan,
      activePlanExpireAt,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const subscribe = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { planId, idempotencyKey, txnId, region, selectedStorageAddonId, selectedLiveAddonId, allowStorageTrim } = req.body;
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
    const durationMinutes = plan.planDurationValueInMinute || ((plan as any).durationValue > 0 ? (plan as any).durationValue * 1440 : (((plan as any).dayLimit || defaultDaysByType) * 1440));
    const durationDays = Math.round(durationMinutes / 1440);
    const durationMs = durationMinutes * 60 * 1000;
    const durVal = durationMinutes;
    const durUnit = 'minutes';
    const graceTimeInMinute = plan.graceTimeInMinute || 4320;
    const graceMs = graceTimeInMinute * 60 * 1000;

    const liveLimitPerDay = plan.liveLimitPerDayInMinutes || (plan as any).liveLimitPerDay || 60;
    const liveMinutesTotal = plan.liveLimitTotalInMinute || (plan as any).liveMinutesTotal || (liveLimitPerDay * durationDays);

    const planSnapshot = {
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
      graceDays: Math.ceil(graceTimeInMinute / 1440),
      storageWarnPercent: options.storageWarnDialogPercent || options.storageWarnNotificationPercent || 80,
      features: plan.features,
      isAllowSocialAppChatHistory: (plan as any).isAllowSocialAppChatHistory ?? false,
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

    // ════════════════════════════════════════════════════════════
    // STORAGE DOWNGRADE VALIDATION (PART 3)
    // ════════════════════════════════════════════════════════════
    const newAllowedStorage = (plan.storageBytes || 10737418240) + (storageAddonDoc?.storageBytes || 0);
    const currentUsageDoc = await StorageAccountingService.getStorageUsage(parentUserId);
    const currentUsedBytes = currentUsageDoc?.totalBytes || 0;

    if (newAllowedStorage < currentUsedBytes && allowStorageTrim !== true) {
      return res.status(400).json({
        success: false,
        code: 'STORAGE_DOWNGRADE_NEEDS_CONFIRM',
        message: 'Plan storage limit is smaller than current data usage. Confirmation required to trim oldest excess data.',
        usedBytes: currentUsedBytes,
        allowedBytes: newAllowedStorage,
        excessBytes: currentUsedBytes - newAllowedStorage,
      });
    }

    // Check current subscription for active status & advance queueing (§5 Jio-style)
    // Only queue if user is on an ACTIVE PAID plan. If currently on Trial, activate immediately!
    const currentSub = await Subscription.findOne({ parentUserId });
    const now = new Date();
    const isRealPlanActive = currentSub && currentSub.status === 'active' && !currentSub.isTrial && currentSub.expireAt > now;

    const generatedTxnId = txnId || `txn_${Date.now()}`;

    if (isRealPlanActive) {
      // ════════════════════════════════════════════════════════════
      // ENFORCE SINGLE QUEUED PLAN LIMIT (Option 1)
      // Block further advance plan purchases if 1 is already queued
      // ════════════════════════════════════════════════════════════
      if (currentSub.queuedPlan && (currentSub.queuedPlan as any).planSnapshot) {
        const qName = (currentSub.queuedPlan as any).planSnapshot.name || 'Upcoming Plan';
        const expireStr = currentSub.expireAt ? currentSub.expireAt.toISOString().split('T')[0] : '';
        return res.status(400).json({
          success: false,
          code: 'ADVANCE_PLAN_ALREADY_QUEUED',
          message: `An advance plan (${qName}) is already queued to activate after current plan expires on ${expireStr}. Only 1 advance plan is allowed in queue.`,
        });
      }

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
        allowStorageTrim: Boolean(allowStorageTrim),
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

      const subDeviceId1 = String(req.headers['x-device-id'] || req.headers['device-id'] || req.body?.deviceId || '').trim();
      const subEmail1 = String((req as any).user?.email || '').trim().toLowerCase();
      recordTrialOrPlanUsage(parentUserId, (req as any).user?.phoneNumber, subDeviceId1, subEmail1).catch(() => {});
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
    const graceEndsAt = new Date(expireAt.getTime() + graceMs);

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
        planLiveMinutesUsed: 0,
        liveTotalLimitNotified: false,
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

    // If storage downgrade was confirmed, trim oldest excess data immediately
    if (allowStorageTrim && newAllowedStorage < currentUsedBytes) {
      await StorageDeleteService.trimOldestExcessStorage(parentUserId, newAllowedStorage);
    }

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

    const subDeviceId2 = String(req.headers['x-device-id'] || req.headers['device-id'] || req.body?.deviceId || '').trim();
    const subEmail2 = String((req as any).user?.email || '').trim().toLowerCase();
    recordTrialOrPlanUsage(parentUserId, (req as any).user?.phoneNumber, subDeviceId2, subEmail2).catch(() => {});
    return res.json({ success: true, isQueued: false, subscription });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};

export const activateTrial = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await User.findById(parentUserId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // REQUIRE EMAIL VERIFICATION for password accounts before granting trial
    if (user.primaryProvider === 'password' && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Please verify your email address via the link sent to your inbox before activating the free trial.',
      });
    }

    const phoneInput = req.body.phoneNumber || (req as any).user?.phoneNumber || user?.phoneNumber || '';
    const phoneNumber = (phoneInput || '').trim();
    const emailInput = req.body.email || (req as any).user?.email || user?.email || '';
    const email = (emailInput || '').trim().toLowerCase();
    const normEmail = email ? normalizeEmail(email) : '';
    const rawDevId = req.headers['x-device-id'] || req.headers['device-id'] || req.headers['x-device-uuid'] || req.body?.deviceId || '';
    const deviceId = (typeof rawDevId === 'string' ? rawDevId : Array.isArray(rawDevId) ? rawDevId[0] : '').trim();

    // DISPOSABLE-EMAIL BLOCK: Prevent trial activation with disposable/temporary emails (check normalized)
    if (normEmail && isDisposableEmail(normEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Free trial cannot be activated with a disposable or temporary email address.',
      });
    }

    // Check anti-fraud ledger (including normalizedEmail to stop user+1@ farming)
    const existingLedger = await TrialLedger.findOne({
      $or: [
        ...(normEmail ? [{ normalizedEmail: normEmail }] : []),
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
        ...(deviceId ? [{ deviceId }] : []),
        { parentUserId },
      ],
    });

    if (existingLedger) {
      await recordTrialOrPlanUsage(parentUserId, phoneNumber, deviceId, email);
      return res.status(400).json({
        success: false,
        message: 'Free trial has already been used on this device or account.',
      });
    }

    // Also check if user already has or had any active/expired subscription or order
    const [existingSub, existingOrder] = await Promise.all([
      Subscription.findOne({ parentUserId }).lean(),
      Order.findOne({ parentUserId }).lean(),
    ]);
    if (existingSub || existingOrder) {
      await recordTrialOrPlanUsage(parentUserId, phoneNumber, deviceId, email);
      return res.status(400).json({
        success: false,
        message: 'Free trial is only available for brand new users. An existing plan was already detected.',
      });
    }

    // ATOMIC RESERVATION GUARD: Atomic insert-first prevents concurrent double-trial activation
    try {
      const atomicGuard = await TrialLedger.findOneAndUpdate(
        {
          $or: [
            ...(normEmail ? [{ normalizedEmail: normEmail }] : []),
            ...(deviceId ? [{ deviceId }] : []),
            { parentUserId },
          ],
        },
        {
          $setOnInsert: {
            parentUserId,
            phoneNumber: phoneNumber || undefined,
            email: email || undefined,
            normalizedEmail: normEmail || undefined,
            deviceId: deviceId || undefined,
            usedAt: new Date(),
          },
        },
        { upsert: true, new: false }
      );

      if (atomicGuard) {
        return res.status(400).json({
          success: false,
          message: 'Free trial has already been used on this device or account.',
        });
      }
    } catch (ledgerErr: any) {
      // Catch MongoDB duplicate-key (E11000) error on normalizedEmail / deviceId
      if (ledgerErr?.code === 11000 || ledgerErr?.message?.includes('E11000') || ledgerErr?.name === 'MongoServerError') {
        return res.status(400).json({
          success: false,
          message: 'Free trial has already been used on this device or account.',
        });
      }
      throw ledgerErr;
    }

    // Find trial plan from Plan collection (DB plans table)
    const dbTrialPlan = await Plan.findOne({ type: 'trial', isActive: true });
    const trialOptions: any = dbTrialPlan || {
      planId: 'plan_1_day_trial',
      name: '1 Day Free Trial',
      planDurationValueInMinute: 1440,
      planDurationUnit: 'minutes',
      graceTimeInMinute: 4320,
      storageBytes: 104857600,
      liveLimitTotalInMinute: 10,
      liveLimitPerDayInMinutes: 10,
      deviceLimit: 1,
      features: [
        'No ads',
        '1 device connect',
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
        '100 mb storage',
      ],
    };

    const durationMinutes = trialOptions.planDurationValueInMinute || (trialOptions.durationValue ? toMs(trialOptions.durationValue, trialOptions.durationUnit || 'days') / 60000 : 1440);
    const durationMs = durationMinutes * 60 * 1000;
    const graceTimeInMinute = trialOptions.graceTimeInMinute || 4320;
    const graceMs = graceTimeInMinute * 60 * 1000;

    const startAt = new Date();
    const expireAt = new Date(startAt.getTime() + durationMs);
    const options = await ConfigService.getMergedOptions();
    const graceEndsAt = new Date(expireAt.getTime() + graceMs);

    const storageBytesVal = trialOptions.storageBytes || 104857600;
    const deviceLimit = trialOptions.deviceLimit ?? 1;
    const liveMinutes = trialOptions.liveLimitTotalInMinute ?? trialOptions.liveMinutesTotal ?? 10;
    const liveLimitPerDay = trialOptions.liveLimitPerDayInMinutes ?? trialOptions.liveLimitPerDay ?? 10;
    const durationDays = Math.round(durationMinutes / 1440) || 1;

    const planSnapshot = {
      planId: trialOptions.planId || 'plan_1_day_trial',
      name: trialOptions.name || '1 Day Free Trial',
      type: 'trial',
      price: 0,
      storageBytes: storageBytesVal,
      liveMinutesTotal: liveMinutes,
      liveLimitTotalInMinute: liveMinutes,
      liveLimitPerDay,
      liveLimitPerDayInMinutes: liveLimitPerDay,
      liveSessionMaxMin: options.liveSessionMaxMin || 5,
      deviceLimit,
      dayLimit: durationDays,
      planDurationValueInMinute: durationMinutes,
      planDurationUnit: trialOptions.planDurationUnit || 'minutes',
      graceTimeInMinute,
      planPriceDiscountPercen: 0,
      durationMs,
      graceDays: Math.ceil(graceTimeInMinute / 1440),
      storageWarnPercent: options.storageWarnDialogPercent || options.storageWarnNotificationPercent || 80,
      isAllowSocialAppChatHistory: false,
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
        planLiveMinutesUsed: 0,
        liveTotalLimitNotified: false,
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

    await recordTrialOrPlanUsage(parentUserId, phoneNumber, deviceId, email);

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
    if (err?.code === 11000 || err?.message?.includes('E11000') || err?.name === 'MongoServerError') {
      return res.status(400).json({
        success: false,
        message: 'Free trial has already been used on this device or account.',
      });
    }
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
    if (!subscription || subscription.status === 'expired' || subscription.status === 'grace' || subscription.isTrial || subscription.planSnapshot?.type === 'trial' || (subscription.expireAt && subscription.expireAt < now)) {
      return res.status(400).json({
        success: false,
        message: 'Add-on boosters are only available on an active paid plan. Please purchase or renew a subscription plan first.',
      });
    }

    const resolvedRegion = region || subscription.region || 'HIGH_USD';
    const price = addon.priceByRegion[resolvedRegion as keyof typeof addon.priceByRegion] || addon.priceByRegion.HIGH_USD;
    const currency = resolvedRegion === 'IN_INR' ? '₹' : '$';

    if (addon.type === 'live_minutes') {
      subscription.addonLiveMinutesPool = (subscription.addonLiveMinutesPool || 0) + (addon.liveMinutes || 0);
      subscription.lastPurchasedLiveAddonId = addon.addonId;
      subscription.addonLiveExhaustedNotified = false;
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

    // Has the user EVER purchased a paid plan (past or present)? Drives first-vs-returning add-on rules.
    const hasEverPurchasedPlan = await Order.exists({ parentUserId, type: 'plan', status: 'completed' }).then(d => !!d).catch(() => false);

    const backupHours = options.storageBackupAfterExpirPlan || (options.graceDays ? options.graceDays * 24 : 72);

    // If no subscription exists, return subscription: null so app routes to purchase screen or trial can be explicitly activated
    if (!subscription) {
      const storageUsage = await StorageAccountingService.getStorageUsage(parentUserId);
      return res.json({
        success: true,
        subscription: null,
        hasSubscription: false,
        hasEverPurchasedPlan,
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

    let isPlanExpired = now.getTime() > expireAtTime;
    let isGracePeriodActive = isPlanExpired && now.getTime() <= graceEndsAtTime;
    let isGraceExpired = isPlanExpired && now.getTime() > graceEndsAtTime;

    // If an advance plan is queued (§5), suppress expiring-soon / expired warnings
    let hasQueuedPlan = Boolean(subscription.queuedPlan && subscription.queuedPlan.planSnapshot);

    // Update status in Mongo if expired/grace
    if (isPlanExpired) {
      if (hasQueuedPlan) {
        // Activate queued plan immediately on status fetch if expired!
        const q = subscription.queuedPlan!;
        const dMs = q.durationMs || (q.planSnapshot?.planDurationValueInMinute ? q.planSnapshot.planDurationValueInMinute * 60 * 1000 : toMs(q.durationDays || q.planSnapshot?.dayLimit || 30, 'days'));
        const newStartAt = now;
        const newExpireAt = new Date(newStartAt.getTime() + dMs);
        const newGraceMs = (q.planSnapshot?.graceTimeInMinute || 4320) * 60 * 1000;
        const newGraceEndsAt = new Date(newExpireAt.getTime() + newGraceMs);

        subscription.status = 'active';
        subscription.planSnapshot = q.planSnapshot;
        subscription.startAt = newStartAt;
        subscription.expireAt = newExpireAt;
        subscription.graceEndsAt = newGraceEndsAt;
        subscription.txnId = q.txnId;
        subscription.isTrial = false;
        subscription.planLiveMinutesUsed = 0;
        subscription.liveTotalLimitNotified = false;
        if (q.storageAddon) {
          subscription.addonStorageBytes = (subscription.addonStorageBytes || 0) + (q.storageAddon.storageBytes || 0);
          subscription.lastPurchasedStorageAddonId = q.storageAddon.addonId;
        }
        if (q.liveAddon) {
          subscription.addonLiveMinutesPool = (subscription.addonLiveMinutesPool || 0) + (q.liveAddon.liveMinutes || 0);
          subscription.lastPurchasedLiveAddonId = q.liveAddon.addonId;
        }

        // Check Part 3 downgrade handling if queued plan has allowStorageTrim: true!
        if (q.allowStorageTrim) {
          const newAllowedBytes = (q.planSnapshot?.storageBytes || 10737418240) + (subscription.addonStorageBytes || 0);
          const currentUsage = await StorageAccountingService.getStorageUsage(parentUserId);
          if (currentUsage && currentUsage.totalBytes > newAllowedBytes) {
            await StorageDeleteService.trimOldestExcessStorage(parentUserId, newAllowedBytes);
          }
        }

        subscription.queuedPlan = undefined;
        await subscription.save();

        if (q.txnId) {
          await Order.updateMany(
            { $or: [{ txnId: q.txnId }, { 'metadata.parentTxnId': q.txnId }] },
            { $set: { status: 'completed' } }
          ).catch(() => {});
        }

        // Signal child devices to resume/ensure active
        const devs = await Device.find({ parentUserId });
        for (const d of devs) {
          if (d.fcmToken) {
            await sendFcmDataCommand(d.fcmToken, 'SUBSCRIPTION_RESUME', {
              status: 'active',
              expireAt: newExpireAt.toISOString(),
              graceEndsAt: newGraceEndsAt.toISOString(),
            }).catch(() => {});
          }
        }

        // Since queued plan is now activated, reset expired / grace flags
        isPlanExpired = false;
        isGracePeriodActive = false;
        isGraceExpired = false;
        hasQueuedPlan = false;
      } else {
        const targetStatus = isGraceExpired ? 'expired' : 'grace';
        if (subscription.status !== targetStatus) {
          subscription.status = targetStatus;
        }
      }
    } else if (hasQueuedPlan) {
      // Current plan is active with an advance plan queued: never report grace/expired
      isPlanExpired = false;
      isGracePeriodActive = false;
      isGraceExpired = false;
    }

    const isTrial = subscription.isTrial || subscription.planSnapshot?.type === 'trial';
    const expireNotifyIntervalMin = isTrial
      ? (options.trialExpiredWarNotificationIntervalInMinute || 120)
      : (options.expiredWarNotificationIntervalInMinute || 1440);
    const expireNotifyAfterMin = isTrial
      ? (options.trialExpiredWarNotificationAfterTimeInMinute || 60)
      : (options.expiredWarNotificationAfterTimeInMinute || 4320);
    let shouldSendExpireWarnNotify = false;

    if (isPlanExpired && !hasQueuedPlan) {
      const minutesSinceExpiry = Math.floor((now.getTime() - (subscription.expireAt ? subscription.expireAt.getTime() : now.getTime())) / (60 * 1000));
      if (minutesSinceExpiry >= 0 && minutesSinceExpiry <= expireNotifyAfterMin) {
        const lastExpireNotifyTime = subscription.lastExpireWarnNotificationAt ? new Date(subscription.lastExpireWarnNotificationAt).getTime() : 0;
        if (now.getTime() - lastExpireNotifyTime >= expireNotifyIntervalMin * 60 * 1000) {
          shouldSendExpireWarnNotify = true;
          subscription.lastExpireWarnNotificationAt = now;
        }
      }
    }

    if (shouldSendStorageWarnNotify || shouldSendExpireWarnNotify || subscription.isModified()) {
      await subscription.save();
    }

    const liveRemaining = await LiveUsageService.getRemainingLiveMinutes(parentUserId);

    let totalLiveAddonMinutesPurchased = 0;
    try {
      const liveAddonOrders = await Order.find({
        parentUserId,
        type: 'live_addon',
        status: 'completed',
        createdAt: { $gte: subscription.startAt }
      });
      totalLiveAddonMinutesPurchased = liveAddonOrders.reduce((sum, o) => {
        const mins = ((o.metadata as any)?.liveMinutes as number) || (o.planLabel ? parseInt(o.planLabel.match(/\d+/)?.[0] || '0') : 0);
        return sum + mins;
      }, 0);
      if ((subscription as any).liveAddon?.liveMinutes) {
        totalLiveAddonMinutesPurchased = Math.max(totalLiveAddonMinutesPurchased, (subscription as any).liveAddon.liveMinutes);
      }
    } catch (_) {}
    totalLiveAddonMinutesPurchased = Math.max(totalLiveAddonMinutesPurchased, liveRemaining.addonPoolRemaining);
    const totalLiveAddonMinutesUsed = Math.max(0, totalLiveAddonMinutesPurchased - liveRemaining.addonPoolRemaining);

    return res.json({
      success: true,
      subscription,
      hasEverPurchasedPlan,
      hasQueuedPlan,
      queuedPlan: subscription.queuedPlan,
      lastPurchasedStorageAddonId: subscription.lastPurchasedStorageAddonId,
      lastPurchasedLiveAddonId: subscription.lastPurchasedLiveAddonId,
      storageUsage,
      liveUsage: {
        dayKey,
        monthKey,
        dailyMinutesUsed: liveRemaining.dailyUsed,
        dailyLimit: liveRemaining.dailyLimit,
        remainingDailyMinutes: liveRemaining.dailyRemaining,
        planTotalLimit: liveRemaining.planTotalLimit,
        planTotalUsed: liveRemaining.planTotalUsed,
        planTotalRemaining: liveRemaining.planTotalRemaining,
        basePlanRemainingToday: liveRemaining.basePlanRemainingToday,
        addonPool: liveRemaining.addonPoolRemaining,
        addonMinutesUsed,
        remainingAddonPool: liveRemaining.addonPoolRemaining,
        totalRemainingLiveMinutes: liveRemaining.totalRemaining,
        totalAddonMinutesPurchased: totalLiveAddonMinutesPurchased,
        totalAddonMinutesUsed: totalLiveAddonMinutesUsed,
        liveSessionMaxMin: options.liveSessionMaxMin || 5,
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
        liveSessionMaxMin: options.liveSessionMaxMin || 5,
        statusGoodUntilStorage: options.statusGoodUntilStorage || 50,
        statusAverageUntilStorage: options.statusAverageUntilStorage || 80,
        statusBadAboveStorage: options.statusBadAboveStorage || 80,
        configOptions: {
          liveSessionMaxMin: options.liveSessionMaxMin || 5,
          statusGoodUntilStorage: options.statusGoodUntilStorage || 50,
          statusAverageUntilStorage: options.statusAverageUntilStorage || 80,
          statusBadAboveStorage: options.statusBadAboveStorage || 80,
          trialExpringSoonWarDialogIntervalInMinute: options.trialExpringSoonWarDialogIntervalInMinute || 120,
          trialExpringSoonWarDialogBeforeTimeInMinute: options.trialExpringSoonWarDialogBeforeTimeInMinute || 240,
          trialExpringSoonWarNotificationIntervalInMinute: options.trialExpringSoonWarNotificationIntervalInMinute || 120,
          trialExpringSoonWarNotificationBeforeTimeInMinute: options.trialExpringSoonWarNotificationBeforeTimeInMinute || 240,
          trialExpiredWarNotificationAfterTimeInMinute: options.trialExpiredWarNotificationAfterTimeInMinute || 60,
          trialExpiredWarNotificationIntervalInMinute: options.trialExpiredWarNotificationIntervalInMinute || 120,
          trialExpiredWarDialogAfterTimeInMinute: options.trialExpiredWarDialogAfterTimeInMinute || 60,
          trialExpiredWarDialogIntervalInMinute: options.trialExpiredWarDialogIntervalInMinute || 120,
          expringSoonWarDialogIntervalInMinute: options.expringSoonWarDialogIntervalInMinute || 1440,
          expringSoonWarDialogBeforeTimeInMinute: options.expringSoonWarDialogBeforeTimeInMinute || 4320,
          expringSoonWarNotificationIntervalInMinute: options.expringSoonWarNotificationIntervalInMinute || 1440,
          expringSoonWarNotificationBeforeTimeInMinute: options.expringSoonWarNotificationBeforeTimeInMinute || 4320,
          expiredWarNotificationAfterTimeInMinute: options.expiredWarNotificationAfterTimeInMinute || 60,
          expiredWarNotificationIntervalInMinute: options.expiredWarNotificationIntervalInMinute || 1440,
          expiredWarDialogAfterTimeInMinute: options.expiredWarDialogAfterTimeInMinute || 60,
          expiredWarDialogIntervalInMinute: options.expiredWarDialogIntervalInMinute || 1440,
          storageWarnNotificationPercent: options.storageWarnNotificationPercent || 80,
          storageWarnNotificationIntervalInMinute: options.storageWarnNotificationIntervalInMinute || 120,
          storageWarnDialogPercent: options.storageWarnDialogPercent || 80,
          storageWarnDialogIntervalInMinute: options.storageWarnDialogIntervalInMinute || 120,
        },
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
    const now = new Date();

    // Auto-reconcile queued orders: if validityStart has arrived or passed, update status to completed
    for (const o of rawOrders) {
      if (o.status === 'queued' && o.validityStart && new Date(o.validityStart) <= now) {
        o.status = 'completed';
        await Order.updateOne({ _id: o._id }, { $set: { status: 'completed' } }).catch(() => {});
      }
    }

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
 * Delete Account (Permanent Account, Data, Devices, Purchases & Storage Wipe)
 */
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const parentUserId = (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id;
    if (!parentUserId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    console.warn(`[DELETE-ACCOUNT] Starting permanent data & account wipe for parent: ${parentUserId}`);

    // Resolve user record to get phone number and Mongo ObjectId
    const user = await User.findById(parentUserId) || ((req as any).user?.phoneNumber ? await User.findOne({ phoneNumber: (req as any).user.phoneNumber }) : null);
    const userObjId = user?._id || (mongoose.isValidObjectId(parentUserId) ? new mongoose.Types.ObjectId(parentUserId) : null);
    const parentUserIds: any[] = [parentUserId];
    if (userObjId) parentUserIds.push(userObjId.toString());
    if (user?._id) parentUserIds.push(user._id.toString());
    const uniqueParentUserIds = Array.from(new Set(parentUserIds));

    // 1. Find ALL devices connected to this parent (handling both ObjectId and String formats)
    const devices = await Device.find({
      $or: [
        { parentUserId: { $in: [userObjId, parentUserId].filter(Boolean) } },
        { parentUserId: { $in: uniqueParentUserIds } },
      ],
    });

    const deviceIds = Array.from(new Set(devices.map((d) => d.deviceId).filter(Boolean)));
    console.log(`[DELETE-ACCOUNT] Found ${devices.length} devices (${deviceIds.join(', ')}) for parent ${parentUserId}`);

    // 2. Erase each device data and signal child
    for (const dev of devices) {
      try {
        // Erase media in R2 + all Mongo text/log collections
        await StorageDeleteService.eraseAllDeviceData(dev.deviceId, parentUserId);

        // Signal child via Socket to unpair immediately
        try {
          getSignalingIo()?.to(dev.deviceId).emit('remote-command', { command: 'UNPAIR', deviceId: dev.deviceId });
        } catch (_) {}

        // Send high-priority wipe & unpair signal via FCM to child
        if (dev.fcmToken) {
          await sendFcmDataCommand(dev.fcmToken, 'DELETE_ACCOUNT_WIPE', {
            command: 'UNPAIR_AND_WIPE_LOCAL',
            action: 'UNPAIR',
          }).catch(() => {});
        }

        // Invalidate Redis/Cache keys for this device
        try {
          await cacheService.del([
            cacheService.keys.appLimits(dev.deviceId),
            cacheService.keys.appBlocks(dev.deviceId),
            cacheService.keys.deviceRules(dev.deviceId),
            cacheService.keys.deviceInfo(dev.deviceId),
          ]);
        } catch (_) {}
      } catch (err: any) {
        console.error(`[DELETE-ACCOUNT-DEVICE-ERROR] ${dev.deviceId}: ${err?.message}`);
      }
    }

    // 3. Remove all device-level records (rules, limits, contacts, schedules, tombstones)
    if (deviceIds.length > 0) {
      await Promise.all([
        AppLimit.deleteMany({ deviceId: { $in: deviceIds } }),
        AppBlockRule.deleteMany({ deviceId: { $in: deviceIds } }),
        Contact.deleteMany({ deviceId: { $in: deviceIds } }),
        ScheduleConfig.deleteMany({ deviceId: { $in: deviceIds } }),
        DeletedRecording.deleteMany({ deviceId: { $in: deviceIds } }),
      ]);
    }

    // 4. Remove all Device documents belonging to this parent
    await Device.deleteMany({
      $or: [
        { parentUserId: { $in: [userObjId, parentUserId].filter(Boolean) } },
        { parentUserId: { $in: uniqueParentUserIds } },
        ...(deviceIds.length > 0 ? [{ deviceId: { $in: deviceIds } }] : []),
      ],
    });

    // 5. Remove all Parent-level data: Subscriptions, Orders, LiveUsage, StorageUsage, User
    // CRITICAL: TrialLedger is PRESERVED so that if the parent re-registers with the same email, phone, or device ID,
    // the Free Trial will NEVER be offered again!
    const phoneFilter = user?.phoneNumber || (req as any).user?.phoneNumber;
    const emailFilter = (user?.email || (req as any).user?.email || '').toLowerCase().trim();
    const normEmailFilter = emailFilter ? normalizeEmail(emailFilter) : (user?.normalizedEmail || '');

    // Permanently remember email, normalizedEmail, phone number, and child deviceIds in TrialLedger
    try {
      const ledgerPromises: any[] = [];
      if (normEmailFilter) {
        ledgerPromises.push(
          TrialLedger.findOneAndUpdate(
            { normalizedEmail: normEmailFilter },
            { normalizedEmail: normEmailFilter, email: emailFilter, usedAt: new Date() },
            { upsert: true }
          )
        );
      }
      if (emailFilter && emailFilter !== normEmailFilter) {
        ledgerPromises.push(
          TrialLedger.findOneAndUpdate(
            { email: emailFilter },
            { email: emailFilter, normalizedEmail: normEmailFilter, usedAt: new Date() },
            { upsert: true }
          )
        );
      }
      if (phoneFilter) {
        ledgerPromises.push(
          TrialLedger.findOneAndUpdate(
            { phoneNumber: phoneFilter },
            { phoneNumber: phoneFilter, email: emailFilter, usedAt: new Date() },
            { upsert: true }
          )
        );
      }
      for (const devId of deviceIds) {
        if (devId) {
          ledgerPromises.push(
            TrialLedger.findOneAndUpdate(
              { deviceId: devId },
              { deviceId: devId, email: emailFilter, usedAt: new Date() },
              { upsert: true }
            )
          );
        }
      }
      await Promise.allSettled(ledgerPromises);
      console.log(`[DELETE-ACCOUNT] Permanently preserved trial prevention in TrialLedger for: email=${emailFilter}, phone=${phoneFilter}, devices=${deviceIds.length}`);
    } catch (e: any) {
      console.warn('[DELETE-ACCOUNT] TrialLedger preserve warning:', e?.message);
    }
    // Delete Firebase Auth identities so old credentials cannot log back in (no resurrection)
    try {
      const usersToDelete = await User.find({
        $or: [
          { _id: { $in: [parentUserId, userObjId].filter(Boolean) } },
          ...(phoneFilter ? [{ phoneNumber: phoneFilter }] : []),
        ],
      }).select('firebaseUid email').lean();
      const fbUids = Array.from(new Set(usersToDelete.map((u: any) => u.firebaseUid).filter(Boolean))) as string[];
      const fbEmails = Array.from(new Set([user?.email, ...usersToDelete.map((u: any) => u.email)].filter(Boolean))) as string[];
      console.log('[DELETE-ACCOUNT] users found:', usersToDelete.length, '| uids:', JSON.stringify(fbUids), '| emails:', JSON.stringify(fbEmails));
      await Promise.all([
        ...fbUids.map((uid) => deleteFirebaseUser(uid)),
        ...fbEmails.map((em) => deleteFirebaseUserByEmail(em)),
      ]);
    } catch (e: any) {
      console.warn('[DELETE-ACCOUNT] Firebase user delete warning:', e?.message);
    }

    await Promise.all([
      Subscription.deleteMany({ parentUserId: { $in: uniqueParentUserIds } }),
      LiveUsage.deleteMany({ parentUserId: { $in: uniqueParentUserIds } }),
      StorageUsage.deleteMany({ parentUserId: { $in: uniqueParentUserIds } }),
      Order.deleteMany({ parentUserId: { $in: uniqueParentUserIds } }),
      User.deleteMany({
        $or: [
          { _id: { $in: [parentUserId, userObjId].filter(Boolean) } },
          ...(phoneFilter ? [{ phoneNumber: phoneFilter }] : []),
        ],
      }),
    ]);

    console.warn(`[DELETE-ACCOUNT] Permanently wiped all account, device, storage, purchase and user data for: ${parentUserId}`);

    return res.json({
      success: true,
      message: 'Your account and all associated data, media, device connections, and purchase history have been permanently deleted.',
    });
  } catch (err: any) {
    console.error(`[DELETE-ACCOUNT-ERROR] ${err?.message}`);
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

    const configOpts = await ConfigService.getMergedOptions();
    const defaultMins = configOpts?.defaultAutoDeleteMinutes || 10080;

    const devices = await Device.find({ parentUserId: user?._id || parentUserId });
    const perDevice: Record<string, any> = {};
    for (const dev of devices) {
      perDevice[dev.deviceId] = {
        deviceId: dev.deviceId,
        deviceName: dev.deviceName || dev.deviceModel || 'Child Device',
        isEnabled: dev.autoDeleteIsEnabled ?? user?.autoDeleteIsEnabled ?? false,
        minutesOption: dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? defaultMins,
        daysOption: dev.autoDeleteDays ?? Math.ceil((dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? defaultMins) / 1440),
        categoriesSelected: (dev.autoDeleteCategories && dev.autoDeleteCategories.length > 0)
          ? dev.autoDeleteCategories
          : (user?.autoDeleteCategories ?? ['all']),
      };
    }

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? defaultMins,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? defaultMins) / 1440),
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
    const configOpts = await ConfigService.getMergedOptions();
    const defaultMins = configOpts?.defaultAutoDeleteMinutes || 10080;
    const mins = minutesOption || (daysOption ? daysOption * 1440 : defaultMins);
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
        minutesOption: dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? defaultMins,
        daysOption: dev.autoDeleteDays ?? Math.ceil((dev.autoDeleteMinutes ?? user?.autoDeleteMinutes ?? defaultMins) / 1440),
        categoriesSelected: (dev.autoDeleteCategories && dev.autoDeleteCategories.length > 0)
          ? dev.autoDeleteCategories
          : (user?.autoDeleteCategories ?? ['all']),
      };
    }

    const autoDelete = {
      parentUserId,
      isEnabled: user?.autoDeleteIsEnabled ?? false,
      minutesOption: user?.autoDeleteMinutes ?? defaultMins,
      daysOption: Math.ceil((user?.autoDeleteMinutes ?? defaultMins) / 1440),
      categoriesSelected: user?.autoDeleteCategories ?? ['all'],
      deviceIdsSelected: user?.autoDeleteDeviceIds ?? [],
      perDevice,
    };

    return res.json({ success: true, autoDelete, perDevice });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
};
