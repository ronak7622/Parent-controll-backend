require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/child_protect_db';
const phone = process.argv[2] || '+919999999999';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const users = await db.collection('users').find({
    $or: [
      { phoneNumber: phone },
      { phoneNumber: '+919999999999' },
      { phoneNumber: '+19999999999' },
      { phoneNumber: '9999999999' },
      { phoneNumber: /999999999/ },
    ]
  }).toArray();

  console.log(`Found ${users.length} user accounts to clear:`, users.map(u => ({ id: u._id.toString(), phone: u.phoneNumber })));

  const parentIds = users.map(u => u._id);
  const parentIdStrs = users.map(u => u._id.toString());
  const allParentMatches = [...parentIds, ...parentIdStrs];

  // 1. Find all devices
  const devices = await db.collection('devices').find({
    parentUserId: { $in: allParentMatches }
  }).toArray();
  const deviceIds = devices.map(d => d.deviceId);
  console.log(`Found ${devices.length} devices connected to this user:`, deviceIds);

  // 2. Wipe media & logs for these devices
  if (deviceIds.length > 0) {
    const devFilter = { deviceId: { $in: deviceIds } };
    await Promise.all([
      db.collection('mediacaptures').deleteMany(devFilter),
      db.collection('recordings').deleteMany(devFilter),
      db.collection('callrecordings').deleteMany(devFilter),
      db.collection('calllogs').deleteMany(devFilter),
      db.collection('browserhistories').deleteMany(devFilter),
      db.collection('locationlogs').deleteMany(devFilter),
      db.collection('childnotifications').deleteMany(devFilter),
      db.collection('childmessages').deleteMany(devFilter),
      db.collection('appusages').deleteMany(devFilter),
      db.collection('appsessions').deleteMany(devFilter),
      db.collection('applimits').deleteMany(devFilter),
      db.collection('appblockrules').deleteMany(devFilter),
      db.collection('contacts').deleteMany(devFilter),
      db.collection('drivingtrips').deleteMany(devFilter),
      db.collection('keyboardlogs').deleteMany(devFilter),
      db.collection('wifilogs').deleteMany(devFilter),
      db.collection('internetlogs').deleteMany(devFilter),
      db.collection('youtubehistories').deleteMany(devFilter),
      db.collection('youtubesessions').deleteMany(devFilter),
      db.collection('scheduleconfigs').deleteMany(devFilter),
    ]);
    console.log('Cleared all media and logs for devices.');
  }

  // 3. Remove devices
  await db.collection('devices').deleteMany({ parentUserId: { $in: allParentMatches } });
  console.log('Removed devices.');

  // 4. Remove subscriptions, usage accounting, orders
  await Promise.all([
    db.collection('subscriptions').deleteMany({ parentUserId: { $in: allParentMatches } }),
    db.collection('storageusages').deleteMany({ parentUserId: { $in: allParentMatches } }),
    db.collection('liveusages').deleteMany({ parentUserId: { $in: allParentMatches } }),
    db.collection('orders').deleteMany({ parentUserId: { $in: allParentMatches } }),
    db.collection('trialledgers').deleteMany({ parentUserId: { $in: allParentMatches } }),
    db.collection('trialledgers').deleteMany({ phoneNumber: /999999999/ }),
  ]);
  console.log('Removed subscriptions, storage usage, live usage, orders, and trial ledger entries.');

  console.log('✅ FRESH STATE READY: User +919999999999 has 0 devices, 0 subscriptions, 0 storage used, and free trial / new plan ready to test.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('[CLEAR-ERROR]', err);
  process.exit(1);
});
