import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Device } from '../models/Device';
import { sendFcmDataCommand } from '../services/fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';

/**
 * Generate/Register 6-digit Pairing Code for Child device
 */
export const generatePairingCode = async (req: any, res: Response) => {
  try {
    const { deviceId, code: customCode, deviceName, deviceModel, deviceBrand } = req.body;
    const parentUserId = req.user?.userId || req.body.parentUserId;

    const code = customCode || Math.floor(100000 + Math.random() * 900000).toString();
    const targetDeviceId = deviceId || `session_${code}`;

    await Device.findOneAndUpdate(
      { pairingCode: code },
      {
        deviceId: targetDeviceId,
        deviceName: deviceName || 'Child Device',
        deviceModel: deviceModel || '',
        deviceBrand: deviceBrand || '',
        pairingCode: code,
        isPaired: false,
        parentUserId: parentUserId || null,
        isOnline: true,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`[PAIRING] Session registered with code: ${code}`);

    return res.json({
      success: true,
      code,
      pairingCode: code,
      expiresInMinutes: 15,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Check Pairing Status (Called by Parent App & Child App polling)
 */
export const checkPairingStatus = async (req: any, res: Response) => {
  try {
    const { code } = req.params;
    const device = await Device.findOne({
      $or: [{ pairingCode: code }, { deviceId: code }],
      isPaired: true,
    });

    if (device) {
      return res.json({
        success: true,
        isPaired: true,
        isSetupComplete: !!device.isSetupComplete,
        deviceId: device.deviceId,
        parentUid: device.parentUserId ? device.parentUserId.toString() : 'parent',
      });
    }

    return res.json({
      success: true,
      isPaired: false,
      isSetupComplete: false,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child App completes permissions setup
 */
export const completeChildSetup = async (req: any, res: Response) => {
  try {
    const { deviceId, code } = req.body;
    const targetId = deviceId || code;

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const initialDevice = await Device.findOne({
      $or: [{ deviceId: targetId }, { pairingCode: targetId }],
    });

    if (!initialDevice) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const queryFilters: any[] = [{ deviceId: targetId }, { pairingCode: targetId }];
    if (initialDevice.pairingCode) queryFilters.push({ pairingCode: initialDevice.pairingCode });
    if (initialDevice.deviceId) queryFilters.push({ deviceId: initialDevice.deviceId });

    await Device.updateMany(
      { $or: queryFilters },
      { $set: { isSetupComplete: true, isPaired: true } }
    );

    const updatedDevice = await Device.findOne({ deviceId: targetId }) || initialDevice;

    console.log(`[SETUP-COMPLETE] Permissions setup completed for device ${updatedDevice.deviceId}`);

    return res.json({
      success: true,
      message: 'Setup completed successfully',
      isSetupComplete: true,
      device: updatedDevice,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Check Setup Status (Called by Parent App when clicking "Done")
 */
export const checkSetupStatus = async (req: any, res: Response) => {
  try {
    const { code } = req.params;
    const parentUserId = req.user?.userId;

    const devices = await Device.find({
      $or: [{ pairingCode: code }, { deviceId: code }],
    });

    if (devices && devices.length > 0) {
      const isComplete = devices.some(d => d.isSetupComplete === true);
      const isPaired = devices.some(d => d.isPaired === true);
      const targetDevice = devices.find(d => d.deviceId && !d.deviceId.startsWith('session_')) || devices[0];

      if (parentUserId) {
        for (const dev of devices) {
          if (!dev.parentUserId || dev.parentUserId.toString() !== parentUserId.toString()) {
            dev.parentUserId = parentUserId as any;
            await dev.save();
          }
        }
      }

      return res.json({
        success: true,
        isPaired,
        isSetupComplete: isComplete,
        deviceId: targetDevice.deviceId,
      });
    }

    return res.json({
      success: false,
      isPaired: false,
      isSetupComplete: false,
      message: 'Device session not found',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Pair Device using 6-Digit Code (Called by Parent App)
 */
export const pairDeviceWithCode = async (req: AuthRequest, res: Response) => {
  try {
    const parentUserId = req.user?.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Pairing code is required' });
    }

    const device = await Device.findOne({
      $or: [{ pairingCode: code }, { deviceId: code }],
    });

    if (!device) {
      return res.status(400).json({ success: false, message: 'Invalid or expired pairing code.' });
    }

    device.parentUserId = parentUserId as any;
    device.isPaired = true;
    device.isOnline = true;
    device.lastSeenAt = new Date();
    await device.save();

    console.log(`[PAIRING-SUCCESS] Parent ${parentUserId} paired with device ${device.deviceId} (code: ${code})`);

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child Device registers or verifies Pairing Code directly
 */
export const pairChildDevice = async (req: any, res: Response) => {
  try {
    const { deviceId, code, pairingCode, deviceName, deviceModel, deviceBrand, osType, fcmToken, parentUserId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required.' });
    }

    const inputCode = code || pairingCode;
    let targetParentUserId = parentUserId;

    if (inputCode) {
      const codeRecord = await Device.findOne({ pairingCode: inputCode });
      if (codeRecord) {
        if (codeRecord.parentUserId) {
          targetParentUserId = codeRecord.parentUserId;
        }
        codeRecord.isPaired = true;
        await codeRecord.save();
      }
    }

    let device = await Device.findOne({ deviceId });
    if (!device) {
      device = new Device({
        deviceId,
        parentUserId: targetParentUserId || null,
        pairingCode: inputCode || null,
        deviceName: deviceName || 'Child Device',
        deviceModel: deviceModel || '',
        deviceBrand: deviceBrand || '',
        osType: osType || 'android',
        isPaired: true,
        isSetupComplete: false,
        fcmToken: fcmToken || '',
      });
    } else {
      if (targetParentUserId) device.parentUserId = targetParentUserId;
      if (inputCode) device.pairingCode = inputCode;
      if (fcmToken) device.fcmToken = fcmToken;
      device.isPaired = true;
      device.isSetupComplete = false;
      device.isOnline = true;
      device.lastSeenAt = new Date();
    }

    await device.save();
    console.log(`[PAIRING-SUCCESS] Child device ${deviceId} paired with code ${inputCode}`);

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      device,
      parentUid: device.parentUserId ? device.parentUserId.toString() : 'parent',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all paired devices for logged-in Parent
 */
export const getParentDevices = async (req: AuthRequest, res: Response) => {
  try {
    const parentUserId = req.user?.userId;

    if (!parentUserId) {
      const allDevices = await Device.find({
        isPaired: true,
        deviceId: { $not: /^session_/ }
      }).sort({ updatedAt: -1 });
      return res.json({
        success: true,
        devices: allDevices,
      });
    }

    let rawDevices = await Device.find({
      $or: [
        { parentUserId },
        { isPaired: true, parentUserId: null, deviceId: { $not: /^session_/ } }
      ]
    }).sort({ updatedAt: -1 });

    const realDevices = rawDevices.filter(d => !d.deviceId.startsWith('session_'));

    for (const dev of realDevices) {
      if (!dev.parentUserId) {
        dev.parentUserId = parentUserId as any;
        await dev.save();
      }
    }

    return res.json({
      success: true,
      devices: realDevices,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Device Settings & Restrictions (YouTube, Browser, App Block, Timers)
 */
export const updateDeviceSettings = async (req: AuthRequest, res: Response) => {
  try {
    const deviceId = req.params.deviceId || req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const updates: any = { ...req.body };
    const mongoUpdate: any = {};

    const mode = updates.browserRestrictionsMode || updates.browserRestrictionMode;
    if (mode) {
      updates.browserRestrictionsMode = mode;
      updates.browserRestrictionMode = mode;
    }

    if (updates.addBlacklist) {
      mongoUpdate['$addToSet'] = mongoUpdate['$addToSet'] || {};
      mongoUpdate['$addToSet']['browserBlacklist'] = updates.addBlacklist;
      delete updates.addBlacklist;
    }
    if (updates.addBlacklistUrls && Array.isArray(updates.addBlacklistUrls)) {
      mongoUpdate['$addToSet'] = mongoUpdate['$addToSet'] || {};
      mongoUpdate['$addToSet']['browserBlacklist'] = { $each: updates.addBlacklistUrls };
      delete updates.addBlacklistUrls;
    }
    if (updates.removeBlacklist) {
      mongoUpdate['$pull'] = mongoUpdate['$pull'] || {};
      mongoUpdate['$pull']['browserBlacklist'] = updates.removeBlacklist;
      delete updates.removeBlacklist;
    }
    if (updates.addWhitelist) {
      mongoUpdate['$addToSet'] = mongoUpdate['$addToSet'] || {};
      mongoUpdate['$addToSet']['browserWhitelist'] = updates.addWhitelist;
      delete updates.addWhitelist;
    }
    if (updates.addWhitelistUrls && Array.isArray(updates.addWhitelistUrls)) {
      mongoUpdate['$addToSet'] = mongoUpdate['$addToSet'] || {};
      mongoUpdate['$addToSet']['browserWhitelist'] = { $each: updates.addWhitelistUrls };
      delete updates.addWhitelistUrls;
    }
    if (updates.removeWhitelist) {
      mongoUpdate['$pull'] = mongoUpdate['$pull'] || {};
      mongoUpdate['$pull']['browserWhitelist'] = updates.removeWhitelist;
      delete updates.removeWhitelist;
    }

    if (Object.keys(updates).length > 0) {
      mongoUpdate['$set'] = updates;
    }

    const isObjId = mongoose.isValidObjectId(deviceId);
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] },
      mongoUpdate,
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {});
    }

    const restrictions = {
      youtubeBlocked: device.youtubeBlocked ?? false,
      youtubeShortsBlocked: device.youtubeShortsBlocked ?? false,
      youtubeBlockSchedule: device.youtubeBlockSchedule,
      youtubeShortsBlockSchedule: device.youtubeShortsBlockSchedule,
      youtubeRestrictedMode: device.youtubeRestrictedMode ?? false,
      youtubeBlockedKeywords: device.youtubeBlockedKeywords || [],
      preventNotificationDisable: device.preventNotificationDisable ?? false,
      notifyOnBlockedUrlAttempt: device.notifyOnBlockedUrlAttempt ?? true,
      browserRestrictionMode: device.browserRestrictionMode || device.browserRestrictionsMode || 'unrestricted',
      browserRestrictionsMode: device.browserRestrictionsMode || device.browserRestrictionMode || 'unrestricted',
      browserBlacklist: device.browserBlacklist || [],
      browserWhitelist: device.browserWhitelist || [],
      browserBlockedCategories: device.browserBlockedCategories || [],
      blockedApps: device.blockedApps || [],
    };

    getSignalingIo()?.to(device.deviceId).emit('remote-command', {
      command: 'UPDATE_RULES',
      deviceId: device.deviceId,
      restrictions,
    });

    return res.json({
      success: true,
      message: 'Device restrictions updated successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send Instant Remote Command (Live Screen, Live Camera, Live Audio, Capture Photo)
 */
export const sendRemoteCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { command, actionType } = req.body;
    const targetCommand = command || actionType || 'TAKE_SCREENSHOT';

    const isObjId = mongoose.isValidObjectId(deviceId);
    const device = await Device.findOne({ $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    // Emit via Socket.io signaling
    getSignalingIo()?.to(device.deviceId).emit('remote-command', { command: targetCommand, deviceId: device.deviceId });

    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, targetCommand, { action: targetCommand });
    }

    return res.json({
      success: true,
      message: `Remote command '${targetCommand}' dispatched to child device.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Disconnect / Unpair Device
 */
export const disconnectDevice = async (req: any, res: Response) => {
  try {
    const deviceId = req.params.deviceId || req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const isObjId = mongoose.isValidObjectId(deviceId);
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] },
      { $set: { isPaired: false, isSetupComplete: false, parentUserId: null, pairingCode: null } },
      { new: true }
    );

    if (device) {
      // Emit UNPAIR signal to child device socket room
      getSignalingIo()?.to(device.deviceId).emit('remote-command', { command: 'UNPAIR', deviceId: device.deviceId });
    }

    console.log(`[DISCONNECT] Device ${deviceId} disconnected by parent.`);

    return res.json({
      success: true,
      message: 'Device unpaired successfully.',
      device,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get single device details
 */
export const getDeviceDetails = async (req: any, res: Response) => {
  try {
    const { deviceId } = req.params;
    const isObjId = mongoose.isValidObjectId(deviceId);
    const device = await Device.findOne({ $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] });
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    return res.json(device);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
