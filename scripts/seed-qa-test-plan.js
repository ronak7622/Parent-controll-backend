/**
 * Upserts the 3 Days QA Test Plan (₹5) in MongoDB.
 * Marked with isTestPlan: true so ONLY tester emails see it.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
const TEST_PLAN_ID = 'plan_3_days_test';

const testPlanData = {
  planId: TEST_PLAN_ID,
  name: '3 Days QA Test Plan',
  nameI18n: {
    en: '3 Days QA Test Plan',
    hi: '3 दिन का टेस्ट प्लान',
    gu: '3 દિવસ ટેસ્ટ પ્લાન',
    es: 'Plan de prueba de 3 días',
    fr: 'Plan test de 3 jours',
  },
  type: 'test',
  webPriceByRegion: { IN_INR: 5, OTHER_USD: 0.99 },
  appPriceByRegion: { IN_INR: 5, OTHER_USD: 0.99 },
  priceByRegion: { IN_INR: 5, OTHER_USD: 0.99, LOW_USD: 0.99, HIGH_USD: 0.99 },
  discountCompareToApp: 0,
  storageBytes: 10737418240, // 10 GB
  planDurationValueInMinute: 4320, // 3 days in minutes (3 * 1440)
  planDurationUnit: 'minutes',
  graceTimeInMinute: 1440, // 1 day grace
  planPriceDiscountPercen: 0,
  liveLimitTotalInMinute: 180, // 3 hours
  liveLimitPerDayInMinutes: 60,
  deviceLimit: 5,
  features: [
    '5 devices connect',
    '10 gb storage',
    'Live screen mirro',
    'Live video camera',
    'Live Audio',
    'QA Test Plan (₹5 • 3 Days validity)',
  ],
  featuresI18n: {
    en: ['5 devices connect', '10 gb storage', 'Live screen mirror', 'Live video camera', 'Live Audio', 'QA Test Plan (₹5 • 3 Days validity)'],
    hi: ['5 डिवाइस कनेक्ट', '10 gb स्टोरेज', 'लाइव स्क्रीन मिरर', 'लाइव वीडियो कैमरा', 'लाइव ऑडियो', 'QA टेस्ट प्लान (₹5 • 3 दिन की वैधता)'],
    gu: ['5 ડિવાઇસ કનેક્ટ', '10 gb સ્ટોરેજ', 'લાઈવ સ્ક્રીન મિરર', 'લાઈવ વિડિયો કેમેરો', 'લાઈવ ઓડિયો', 'QA ટેસ્ટ પ્લાન (₹5 • 3 દિવસ માન્યતા)'],
    es: ['5 dispositivos conectados', '10 gb de almacenamiento', 'Espejo de pantalla en vivo', 'Cámara de video en vivo', 'Audio en vivo', 'Plan de prueba de control de calidad (₹5 • 3 días de validez)'],
    fr: ['5 appareils connectés', '10 Go de stockage', 'Miroir d\'écran en direct', 'Caméra vidéo en direct', 'Audio en direct', 'Plan de test QA (₹5 • 3 jours de validité)'],
  },
  isActive: true,
  isTestPlan: true, // Crucial: Only visible and buyable by whitelisted emails
  isRecommended: false,
  sortOrder: 99,
  isAllowSocialAppChatHistory: true,
};

(async () => {
  try {
    console.log('[seed-qa-test-plan] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    await db.collection('plans').updateOne(
      { planId: TEST_PLAN_ID },
      {
        $set: {
          ...testPlanData,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    console.log('✅ [seed-qa-test-plan] Successfully created/updated plan_3_days_test (₹5, 3 days)!');
    console.log('🔒 Whitelisted Tester Emails will see this plan in App and Web checkout.');
    console.log('⛔ Normal public users will NOT see this plan.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ [seed-qa-test-plan] Error:', err);
    process.exit(1);
  }
})();
