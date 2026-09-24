import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function cleanDb() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
    console.log(`Connecting to MongoDB at: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection failed');
    }

    // Clear AppUsage
    const usageResult = await db.collection('appusages').deleteMany({});
    console.log(`Deleted ${usageResult.deletedCount} documents from appusages collection.`);

    // Clear AppSession
    const sessionResult = await db.collection('appsessions').deleteMany({});
    console.log(`Deleted ${sessionResult.deletedCount} documents from appsessions collection.`);

    // Reset device sync flags
    const deviceResult = await db.collection('devices').updateMany(
      {},
      { 
        $set: { 
          isSyncingPastUsage: false, 
          pastUsageSynced: false,
          lastUsageSyncTime: null 
        } 
      }
    );
    console.log(`Reset sync status on ${deviceResult.modifiedCount} device documents.`);

    console.log('Database cleaning completed successfully!');
  } catch (err) {
    console.error('Error cleaning database:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

cleanDb();
