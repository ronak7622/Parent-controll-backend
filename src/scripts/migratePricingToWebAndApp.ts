import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/child_protect_db';

export async function runPricingMigration(): Promise<void> {
  console.log('[Migration] Starting pricing migration to webPriceByRegion & appPriceByRegion...');

  const plans = await Plan.find({});
  let plansUpdated = 0;
  for (const p of plans) {
    const raw = p.toObject() as any;
    const oldPrice = raw.priceByRegion || {};
    const inInr = oldPrice.IN_INR ?? 299;
    const otherUsd = oldPrice.HIGH_USD ?? oldPrice.LOW_USD ?? 9.99;

    const webInr = raw.webPriceByRegion?.IN_INR ?? inInr;
    const webUsd = raw.webPriceByRegion?.OTHER_USD ?? otherUsd;
    const appInr = raw.appPriceByRegion?.IN_INR ?? inInr;
    const appUsd = raw.appPriceByRegion?.OTHER_USD ?? otherUsd;
    const discount = typeof raw.discountCompareToApp === 'number' ? raw.discountCompareToApp : 0;

    await Plan.updateOne(
      { _id: p._id },
      {
        $set: {
          webPriceByRegion: { IN_INR: webInr, OTHER_USD: webUsd },
          appPriceByRegion: { IN_INR: appInr, OTHER_USD: appUsd },
          discountCompareToApp: discount,
        },
      }
    );
    plansUpdated++;
  }
  console.log(`[Migration] Updated ${plansUpdated} plans with web/app pricing.`);

  const addons = await AddonPlan.find({});
  let addonsUpdated = 0;
  for (const a of addons) {
    const raw = a.toObject() as any;
    const oldPrice = raw.priceByRegion || {};
    const inInr = oldPrice.IN_INR ?? 99;
    const otherUsd = oldPrice.HIGH_USD ?? oldPrice.LOW_USD ?? 3.99;

    const webInr = raw.webPriceByRegion?.IN_INR ?? inInr;
    const webUsd = raw.webPriceByRegion?.OTHER_USD ?? otherUsd;
    const appInr = raw.appPriceByRegion?.IN_INR ?? inInr;
    const appUsd = raw.appPriceByRegion?.OTHER_USD ?? otherUsd;
    const discount = typeof raw.discountCompareToApp === 'number' ? raw.discountCompareToApp : 0;

    await AddonPlan.updateOne(
      { _id: a._id },
      {
        $set: {
          webPriceByRegion: { IN_INR: webInr, OTHER_USD: webUsd },
          appPriceByRegion: { IN_INR: appInr, OTHER_USD: appUsd },
          discountCompareToApp: discount,
        },
      }
    );
    addonsUpdated++;
  }
  console.log(`[Migration] Updated ${addonsUpdated} addons with web/app pricing.`);
}

async function main() {
  try {
    console.log('[Migration] Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    await runPricingMigration();
    console.log('[Migration] Migration completed successfully.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
