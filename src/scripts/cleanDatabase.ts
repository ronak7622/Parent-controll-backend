import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/child_protect_db';

// Protected system collections that MUST NOT be touched
const PROTECTED_COLLECTIONS = new Set([
  'plans',
  'addonplans',
  'configs',
  'system.indexes',
  'system.profile',
  'system.views',
]);

async function cleanUserDataOnly() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    console.log('\n======================================================');
    console.log('🧹 CLEANING BACKEND USER DATA (PRESERVING PLANS & CONFIGS)');
    console.log('======================================================\n');

    const db = mongoose.connection.db!;
    const collections = await db.listCollections().toArray();

    let totalDeleted = 0;
    const cleanedCollections: string[] = [];
    const preservedCollections: string[] = [];

    for (const col of collections) {
      const colNameLower = col.name.toLowerCase();
      const currentCount = await db.collection(col.name).countDocuments();

      if (PROTECTED_COLLECTIONS.has(colNameLower)) {
        console.log(`🛡️  PRESERVED (Kept untouched): ${col.name} [${currentCount} docs]`);
        preservedCollections.push(`${col.name} (${currentCount} docs)`);
      } else {
        const result = await db.collection(col.name).deleteMany({});
        console.log(`🗑️  CLEARED: ${col.name} -> Deleted ${result.deletedCount} of ${currentCount} docs`);
        totalDeleted += result.deletedCount;
        cleanedCollections.push(`${col.name} (${result.deletedCount} deleted)`);
      }
    }

    console.log('\n======================================================');
    console.log(`✅ USER DATA CLEANUP COMPLETE!`);
    console.log(`- Total User Data Documents Deleted: ${totalDeleted}`);
    console.log(`- Preserved Collections: ${preservedCollections.join(', ')}`);
    console.log('======================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning database user data:', err);
    process.exit(1);
  }
}

cleanUserDataOnly();
