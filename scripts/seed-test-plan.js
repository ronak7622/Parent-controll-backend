/*
 * TEST-ONLY seeder: adds a 30-min paid test plan + minute-scale config overrides.
 * Usage:  node scripts/seed-test-plan.js <yourPhoneNumber>
 * Revert: node scripts/revert-test-plan.js
 *
 * ⚠ Config keys (grace + notification/dialog intervals) are GLOBAL — they affect
 *   ALL users while set. Run on a test/staging DB, or revert right after testing.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
const phone = process.argv[2] || '';

const TEST_PLAN_ID = 'plan_test_30min';

const cleanDigits = phone.replace(/[^0-9]/g, '');
const phoneVariations = phone ? Array.from(new Set([
  phone,
  cleanDigits,
  `+${cleanDigits}`,
  `+91${cleanDigits.slice(-10)}`,
  `+1${cleanDigits.slice(-10)}`,
  cleanDigits.slice(-10),
])) : [];

const CONFIG_OVERRIDES = {
  storageBackupAfterExpirPlan: 10 / 60,        // hours => 10 min grace
  expringSoonWarNotificationInterval: 1,       // min (also used for expired-notify)
  expredWarNotificationInterval: 1,            // min
  expringSoonWarDialogInterval: 5,             // min
  expredWarDialogInterval: 5,                  // min
  storageWarnNotificationIntervalMin: 2,       // min
  storageWarnIntervalForDialog: 5,             // min
  expringSoonWarNotificationBeforeDay: 1,      // window (days) - covers the short plan
  expredWarNotificationAfterDay: 1,
  expringSoonWarDialogBeforeDay: 1,
  expredWarDialogAfterDay: 1,
  testPlanPhones: phoneVariations,            // all matching formats see the test plan
};

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // 1) Upsert test plan
  await db.collection('plans').updateOne(
    { planId: TEST_PLAN_ID },
    { $set: {
        planId: TEST_PLAN_ID,
        name: 'TEST 30-Min Plan',
        type: 'monthly',
        priceByRegion: { IN_INR: 10, LOW_USD: 1, HIGH_USD: 1 },
        storageBytes: 104857600,      // 100 MB
        dayLimit: 30,                 // fallback only
        durationUnit: 'minutes',
        durationValue: 30,            // 30 min validity
        liveMinutesTotal: 5,
        liveLimitPerDay: 5,           // 5 min / day live
        liveSessionMaxMin: 1,         // 1 min / session
        deviceLimit: 2,
        features: ['TEST PLAN • 30 min validity','100 MB storage','5 min/day live','1 min/session'],
        isActive: true,
        isRecommended: false,
        isTestPlan: true,
        sortOrder: 999,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  console.log('[SEED] Test plan upserted:', TEST_PLAN_ID);

  // 2) Upsert config overrides (per-key docs)
  for (const [key, value] of Object.entries(CONFIG_OVERRIDES)) {
    await db.collection('configs').updateOne(
      { key },
      { $set: { key, value, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  console.log('[SEED] Config overrides applied:', Object.keys(CONFIG_OVERRIDES).join(', '));
  if (!phone) console.warn('[SEED] ⚠ No phone passed -> testPlanPhones=[]; test plan will NOT be visible. Re-run with your phone number.');
  else console.log('[SEED] testPlanPhones =', phone);

  await mongoose.disconnect();
  console.log('[SEED] Done. (Restart backend or wait config TTL for it to take effect.)');
  process.exit(0);
})().catch((e) => { console.error('[SEED-ERROR]', e); process.exit(1); });
