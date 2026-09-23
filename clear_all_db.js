require('dotenv').config();
const mongoose = require('mongoose');

async function clearAllDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
  console.log('Connecting to MongoDB:', uri);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  console.log(`Found ${collections.length} collections in database.`);

  for (const col of collections) {
    try {
      await db.collection(col.name).drop();
      console.log(`Successfully dropped collection: ${col.name}`);
    } catch (e) {
      console.log(`Error dropping ${col.name}: ${e.message}`);
    }
  }

  console.log('All collections and pairing data have been completely wiped and reset!');
  await mongoose.disconnect();

  // Also clean local uploaded files
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, 'public/uploads');
  if (fs.existsSync(uploadsDir)) {
    try {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, '.gitkeep'), '');
      console.log('Successfully cleaned local uploads storage!');
    } catch (e) {
      console.log('Error cleaning uploads:', e.message);
    }
  }
}

clearAllDb().catch(err => {
  console.error('Failed to clear database:', err);
  process.exit(1);
});
