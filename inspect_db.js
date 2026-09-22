require('dotenv').config();
const mongoose = require('mongoose');

async function inspect() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/child_protect_db');
  console.log('Connected to DB:', process.env.MONGODB_URI);

  const AppUsage = mongoose.model('AppUsage', new mongoose.Schema({}, { strict: false }));
  const AppSession = mongoose.model('AppSession', new mongoose.Schema({}, { strict: false }));
  const Device = mongoose.model('Device', new mongoose.Schema({}, { strict: false }));

  const devices = await Device.find({});
  console.log('Devices:', devices.map(d => ({ id: d._id, deviceId: d.deviceId, name: d.deviceName })));

  const usageRecords = await AppUsage.find({ date: { $in: ['2026-09-21', '2026-09-22'] } });
  console.log('=== APP USAGE RECORDS (21 & 22 Sep) ===');
  usageRecords.forEach(u => {
    console.log(`[${u.date}] Pkg: ${u.packageName} | App: ${u.appName} | DurationSec: ${u.usageDurationSeconds} (${Math.floor(u.usageDurationSeconds/60)}m ${u.usageDurationSeconds%60}s)`);
  });

  const sessionRecords = await AppSession.find({ date: { $in: ['2026-09-21', '2026-09-22'] } });
  console.log('=== APP SESSION RECORDS (21 & 22 Sep) ===');
  sessionRecords.forEach(s => {
    console.log(`[${s.date}] Pkg: ${s.packageName} | Start: ${s.startTime} | End: ${s.endTime} | DurSec: ${s.durationSeconds}`);
  });

  await mongoose.disconnect();
}

inspect().catch(console.error);
