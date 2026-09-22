require('dotenv').config();
const mongoose = require('mongoose');

async function reset() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parental_control';
  console.log('Connecting to Mongo:', uri);
  await mongoose.connect(uri);

  const datesToClear = ['2026-09-21', '2026-09-22'];

  const AppUsage = mongoose.model('AppUsage', new mongoose.Schema({}, { strict: false }));
  const AppSession = mongoose.model('AppSession', new mongoose.Schema({}, { strict: false }));

  const resUsage = await AppUsage.deleteMany({ date: { $in: datesToClear } });
  console.log(`Deleted ${resUsage.deletedCount} AppUsage records for dates:`, datesToClear);

  const resSessions = await AppSession.deleteMany({ date: { $in: datesToClear } });
  console.log(`Deleted ${resSessions.deletedCount} AppSession records for dates:`, datesToClear);

  await mongoose.disconnect();
  console.log('Done!');
}

reset().catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
