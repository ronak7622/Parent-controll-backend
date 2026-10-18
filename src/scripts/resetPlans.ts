import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { PLAN_NAMES_I18N, ADDON_NAMES_I18N, localizeFeatureItem } from '../config/plansI18n';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/child_protect_db';

const LANGS = ['en', 'hi', 'gu', 'es', 'fr'] as const;

const commonFeatures = (deviceText: string, storageText: string) => [
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

const buildPlanI18n = (planId: string, enFeatures: string[]) => ({
  nameI18n: Object.fromEntries(LANGS.map(l => [l, PLAN_NAMES_I18N[planId]?.[l] || ''])),
  featuresI18n: Object.fromEntries(LANGS.map(l => [
    l,
    enFeatures.map(f => l === 'en' ? f : localizeFeatureItem(f, l)),
  ])),
});

const buildAddonI18n = (addonId: string) => ({
  nameI18n: Object.fromEntries(LANGS.map(l => [l, ADDON_NAMES_I18N[addonId]?.[l] || ''])),
});

async function resetPlans() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    console.log('Clearing existing plans and addons...');
    await Plan.deleteMany({});
    await AddonPlan.deleteMany({});

    console.log('Inserting updated default plans & 1-day free trial...');
    const trialFeats = commonFeatures('1 device connect', '100 mb storage');
    const paidFeats  = commonFeatures('Unlimited device connect', '20 gb storage');
    await Plan.create([
      {
        planId: 'plan_1_day_trial',
        name: '1 Day Free Trial',
        type: 'trial',
        priceByRegion: { IN_INR: 0, LOW_USD: 0, HIGH_USD: 0 },
        storageBytes: 104857600, // 100 MB
        planDurationValueInMinute: 1440, // 1 day
        planDurationUnit: 'minutes',
        graceTimeInMinute: 4320, // 3 days
        planPriceDiscountPercen: 0,
        liveLimitTotalInMinute: 10,
        liveLimitPerDayInMinutes: 10,
        deviceLimit: 1,
        features: trialFeats,
        ...buildPlanI18n('plan_1_day_trial', trialFeats),
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
        planDurationValueInMinute: 43200, // 30 days
        planDurationUnit: 'minutes',
        graceTimeInMinute: 4320, // 3 days
        planPriceDiscountPercen: 0,
        liveLimitTotalInMinute: 1800,
        liveLimitPerDayInMinutes: 60,
        deviceLimit: 1000, // Unlimited
        features: paidFeats,
        ...buildPlanI18n('plan_1_month', paidFeats),
        isActive: true,
        isRecommended: false,
        sortOrder: 1,
        isAllowSocialAppChatHistory: true,
      },
      {
        planId: 'plan_6_months',
        name: '6 Months Plan',
        type: '6_months',
        priceByRegion: { IN_INR: 2500, LOW_USD: 34.99, HIGH_USD: 59.99 },
        storageBytes: 21474836480, // 20 GB
        planDurationValueInMinute: 259200, // 180 days
        planDurationUnit: 'minutes',
        graceTimeInMinute: 4320, // 3 days
        planPriceDiscountPercen: 20,
        liveLimitTotalInMinute: 10800,
        liveLimitPerDayInMinutes: 60,
        deviceLimit: 1000, // Unlimited
        features: paidFeats,
        ...buildPlanI18n('plan_6_months', paidFeats),
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
        planDurationValueInMinute: 525600, // 365 days
        planDurationUnit: 'minutes',
        graceTimeInMinute: 4320, // 3 days
        planPriceDiscountPercen: 35,
        liveLimitTotalInMinute: 21900,
        liveLimitPerDayInMinutes: 60,
        deviceLimit: 1000, // Unlimited
        features: paidFeats,
        ...buildPlanI18n('plan_1_year', paidFeats),
        isActive: true,
        isRecommended: true,
        sortOrder: 3,
        isAllowSocialAppChatHistory: true,
      },
    ]);

    await AddonPlan.create([
      {
        addonId: 'addon_5gb',
        name: '+5 GB Storage Booster',
        ...buildAddonI18n('addon_5gb'),
        type: 'storage',
        priceByRegion: { IN_INR: 99, LOW_USD: 1.49, HIGH_USD: 2.99 },
        storageBytes: 5368709120,
        isActive: true,
      },
      {
        addonId: 'addon_20gb',
        name: '+20 GB Storage Booster',
        ...buildAddonI18n('addon_20gb'),
        type: 'storage',
        priceByRegion: { IN_INR: 299, LOW_USD: 3.99, HIGH_USD: 7.99 },
        storageBytes: 21474836480,
        isActive: true,
      },
      {
        addonId: 'addon_live_30m',
        name: '+30 Mins Live Limit Booster',
        ...buildAddonI18n('addon_live_60m'),
        type: 'live_minutes',
        priceByRegion: { IN_INR: 49, LOW_USD: 0.99, HIGH_USD: 1.99 },
        storageBytes: 0,
        liveMinutes: 30,
        isActive: true,
      },
      {
        addonId: 'addon_live_120m',
        name: '+120 Mins Live Limit Booster',
        ...buildAddonI18n('addon_live_120m'),
        type: 'live_minutes',
        priceByRegion: { IN_INR: 149, LOW_USD: 2.49, HIGH_USD: 4.99 },
        storageBytes: 0,
        liveMinutes: 120,
        isActive: true,
      },
      {
        addonId: 'addon_live_500m',
        name: '+500 Mins Live Limit Booster',
        ...buildAddonI18n('addon_live_300m'),
        type: 'live_minutes',
        priceByRegion: { IN_INR: 499, LOW_USD: 6.99, HIGH_USD: 12.99 },
        storageBytes: 0,
        liveMinutes: 500,
        isActive: true,
      },
    ]);

    console.log('✅ Plans successfully reset & updated in MongoDB with full features list!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error resetting plans:', err);
    process.exit(1);
  }
}

resetPlans();
