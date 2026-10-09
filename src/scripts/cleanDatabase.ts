import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Subscription } from '../models/Subscription';
import { StorageUsage } from '../models/StorageUsage';
import { TrialLedger } from '../models/TrialLedger';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/parent_control';

async function cleanDatabase() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    console.log('🧹 Wiping all database collections for fresh test run...');

    // Drop all collection data
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      try {
        await collections[key].deleteMany({});
        console.log(`- Cleared collection: ${key}`);
      } catch (err: any) {
        console.warn(`- Failed to clear ${key}: ${err.message}`);
      }
    }

    console.log('🌱 Reseed default Plans and Addons...');
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
        features: ['5 GB Storage', '1 Connected Device', '30 Live Minutes', 'Basic History'],
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
        features: ['20 GB Storage', '3 Connected Devices', '120 Live Minutes', 'Priority Support'],
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
        features: ['50 GB Storage', '5 Connected Devices', '1500 Live Minutes', 'Best Value (40% OFF)'],
        isActive: true,
        sortOrder: 3,
      },
    ]);

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

    console.log('✨ Database completely cleaned and fresh plans reseeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning database:', err);
    process.exit(1);
  }
}

cleanDatabase();
