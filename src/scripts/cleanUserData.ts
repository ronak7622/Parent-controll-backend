import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/child_protect_db';

const PRESERVED_COLLECTIONS = new Set([
  'plans',
  'addonplans',
  'configs',
  'remoteconfigs',
  'system.indexes',
]);

async function cleanUserData() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections in database.`);

    let totalDeleted = 0;
    const preservedList: string[] = [];
    const clearedList: { name: string; count: number }[] = [];

    for (const col of collections) {
      const colName = col.name.toLowerCase();
      if (PRESERVED_COLLECTIONS.has(colName)) {
        const count = await db.collection(col.name).countDocuments();
        preservedList.push(`${col.name} (${count} documents preserved)`);
        continue;
      }

      try {
        const result = await db.collection(col.name).deleteMany({});
        clearedList.push({ name: col.name, count: result.deletedCount });
        totalDeleted += result.deletedCount;
      } catch (err: any) {
        console.warn(`Failed to clean collection ${col.name}:`, err.message);
      }
    }

    console.log('\n=======================================');
    console.log('🛡️ PRESERVED COLLECTIONS (NOT TOUCHED):');
    preservedList.forEach(item => console.log(`   - ${item}`));

    console.log('\n🧹 CLEARED USER DATA COLLECTIONS:');
    clearedList.forEach(item => console.log(`   - ${item.name}: ${item.count} deleted`));

    console.log('=======================================');
    console.log(`✅ Finished! Total deleted documents: ${totalDeleted}`);
  } catch (error) {
    console.error('Error cleaning user data:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

cleanUserData();
