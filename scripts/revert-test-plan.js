/*
 * Revert the test seeder: removes the test plan and DELETES the overridden config
 * keys. Keys that exist in DEFAULT_OPTIONS are auto re-seeded to their production
 * defaults by ConfigService.getMergedOptions() on next read. testPlanPhones is
 * removed entirely. Run: node scripts/revert-test-plan.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
const TEST_PLAN_ID = 'plan_test_30min';

const OVERRIDDEN_KEYS = [
  'storageBackupAfterExpirPlan',
  'expringSoonWarNotificationInterval',
  'expredWarNotificationInterval',
  'expringSoonWarDialogInterval',
  'expredWarDialogInterval',
  'storageWarnNotificationIntervalMin',
  'storageWarnIntervalForDialog',
  'expringSoonWarNotificationBeforeDay',
  'expredWarNotificationAfterDay',
  'expringSoonWarDialogBeforeDay',
  'expredWarDialogAfterDay',
  'testPlanPhones',
];

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const delPlan = await db.collection('plans').deleteOne({ planId: TEST_PLAN_ID });
  console.log('[REVERT] Test plan removed:', delPlan.deletedCount);

  const delCfg = await db.collection('configs').deleteMany({ key: { $in: OVERRIDDEN_KEYS } });
  console.log('[REVERT] Config override keys deleted:', delCfg.deletedCount,
              '-> defaults auto re-seed on next ConfigService read.');

  await mongoose.disconnect();
  console.log('[REVERT] Done. Restart backend (or wait config TTL) so production defaults reload.');
  process.exit(0);
})().catch((e) => { console.error('[REVERT-ERROR]', e); process.exit(1); });
