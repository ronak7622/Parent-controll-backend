require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Collections that MUST NOT be touched
const PRESERVED_COLLECTIONS = new Set([
  'plans',
  'addonplans',
  'configs'
]);

async function cleanUserData() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/child_protect_db';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  console.log(`\nFound ${collections.length} total collections in database.`);
  console.log('Preserving collections:', Array.from(PRESERVED_COLLECTIONS).join(', '));
  console.log('------------------------------------------------------------');

  let cleanedCount = 0;
  let totalDeletedDocs = 0;

  for (const col of collections) {
    if (PRESERVED_COLLECTIONS.has(col.name.toLowerCase())) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`[PRESERVED] ${col.name.padEnd(25)} -> ${count} documents kept`);
      continue;
    }

    try {
      const docCount = await db.collection(col.name).countDocuments();
      await db.collection(col.name).drop();
      console.log(`[DELETED]   ${col.name.padEnd(25)} -> Dropped ${docCount} documents`);
      cleanedCount++;
      totalDeletedDocs += docCount;
    } catch (e) {
      console.log(`[ERROR]     Error dropping ${col.name}: ${e.message}`);
    }
  }

  console.log('------------------------------------------------------------');
  console.log(`Summary: Dropped ${cleanedCount} user/device collections (${totalDeletedDocs} documents removed).`);

  await mongoose.disconnect();
  console.log('MongoDB disconnected.');

  // Clean local user uploads (recordings, captures, keyboard captures, etc.)
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (fs.existsSync(uploadsDir)) {
    console.log('\nCleaning local uploads folder:', uploadsDir);
    const subdirs = ['captures', 'keyboard-captures', 'recordings'];
    
    // Remove all files/folders inside uploads
    const entries = fs.readdirSync(uploadsDir);
    for (const entry of entries) {
      if (entry === '.gitkeep') continue;
      const fullPath = path.join(uploadsDir, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`Deleted: ${entry}`);
      } catch (err) {
        console.error(`Error deleting ${entry}:`, err.message);
      }
    }

    // Re-create necessary structure
    for (const sub of subdirs) {
      const subPath = path.join(uploadsDir, sub);
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, { recursive: true });
        fs.writeFileSync(path.join(subPath, '.gitkeep'), '');
      }
    }
    console.log('Cleaned and re-initialized uploads directories successfully.');
  }

  console.log('\n============================================================');
  console.log('USER DATA CLEANUP COMPLETED SUCCESSFULLY!');
  console.log('Plans and Configs remain 100% intact.');
  console.log('============================================================\n');
}

cleanUserData().catch(err => {
  console.error('Fatal error during cleanup:', err);
  process.exit(1);
});
