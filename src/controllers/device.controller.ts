import mongoose from 'mongoose';
import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { Device, enrichDeviceWithOnlineStatus, isDeviceFresh } from '../models/Device';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { CallRecording } from '../models/CallRecording';
import { MediaCapture } from '../models/MediaCapture';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { Contact } from '../models/Contact';
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { KeyboardLog } from '../models/KeyboardLog';
import { WifiLog } from '../models/wifi-log.model';
import { InternetLog } from '../models/internet-log.model';
import { ScheduleConfig } from '../models/ScheduleConfig';
import { sendFcmDataCommand, sendFcmDirectNotification, sendFcmTopicNotification, sendLocalizedFcmTopicNotification } from '../services/fcm.service';
import { ConfigService } from '../services/ConfigService';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { cacheService, getRedisClient } from '../services/cache.service';

// "1h 5m" / "45m" / "30s"
const formatDurationShort = (totalSeconds: number): string => {
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
};

// Child sends its local time ("04:35 PM"); fall back to IST server time
const resolveEventTime = (localTime?: string): string => {
  if (localTime && String(localTime).trim()) return String(localTime).trim();
  return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
};

/**
 * Generate/Register 6-digit Pairing Code for Child device
 */
export const generatePairingCode = async (req: any, res: Response) => {
  try {
    const { deviceId, code: customCode, deviceName, deviceModel, deviceBrand } = req.body;
    const parentUserId = req.user?.userId || req.body.parentUserId;

    const code = customCode || Math.floor(100000 + Math.random() * 900000).toString();
    const isRealDeviceId = deviceId && !deviceId.startsWith('session_');

    if (isRealDeviceId) {
      await Device.findOneAndUpdate(
        { deviceId },
        {
          pairingCode: code,
          isPaired: false,
          ...(parentUserId ? { parentUserId } : {}),
          ...(deviceName && deviceName !== 'Child Device' ? { deviceName } : {}),
          ...(deviceModel ? { deviceModel } : {}),
          ...(deviceBrand ? { deviceBrand } : {}),
          lastSeenAt: new Date(),
        },
        { upsert: false, new: true }
      );
    } else {
      const targetDeviceId = `session_${code}`;
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
    }

    console.log(`[PAIRING] Session registered with code: ${code}${isRealDeviceId ? ` for device ${deviceId}` : ''}`);

    return res.json({
      success: true,
      code,
      pairingCode: code,
      expiresInMinutes: 15,
    });
  } catch (error: any) {
    console.error('[PAIRING] Error registering code:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Check Pairing Status (Called by Parent App & Child App polling)
 */
export const checkPairingStatus = async (req: any, res: Response) => {
  try {
    const { code } = req.params;
    const devices = await Device.find({
      $or: [{ pairingCode: code }, { deviceId: code }],
      isPaired: true,
    }).sort({ updatedAt: -1 });

    if (devices && devices.length > 0) {
      const targetDevice = devices.find(d => d.deviceId && !d.deviceId.startsWith('session_')) || devices[0];
      const brand = targetDevice.deviceBrand || '';
      const model = targetDevice.deviceModel || '';
      const modelName = `${brand} ${model}`.trim();
      const devName = targetDevice.deviceName && targetDevice.deviceName !== 'Child Device' ? targetDevice.deviceName : (modelName.length > 0 ? modelName : 'Child Device');

      const deviceToken = jwt.sign(
        { deviceId: targetDevice.deviceId, kind: 'device' },
        config.jwtSecret,
        { expiresIn: '3650d' }
      );

      return res.json({
        success: true,
        isPaired: true,
        isSetupComplete: !!targetDevice.isSetupComplete,
        deviceId: targetDevice.deviceId,
        deviceToken,
        deviceName: devName,
        deviceBrand: brand,
        deviceModel: model,
        parentUid: targetDevice.parentUserId ? targetDevice.parentUserId.toString() : 'parent',
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
    const { deviceId, code, secretCode, secureOurChildApp, isAppHidden, deviceName, appVersionCode, appVersionName, languageCode } = req.body;
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

    const updateFields: any = { isSetupComplete: true, isPaired: true, appRemoved: false, appRemovedAt: null, appRemovedNotifiedAt: null };
    if (secretCode) updateFields.secretCode = String(secretCode).trim();
    if (typeof secureOurChildApp !== 'undefined') updateFields.secureOurChildApp = Boolean(secureOurChildApp);
    if (typeof isAppHidden !== 'undefined') updateFields.isAppHidden = Boolean(isAppHidden);
    if (deviceName && String(deviceName).trim().length > 0) updateFields.deviceName = String(deviceName).trim();
    if (typeof appVersionCode !== 'undefined') updateFields.appVersionCode = Number(appVersionCode) || 0;
    if (typeof appVersionName !== 'undefined') updateFields.appVersionName = String(appVersionName).trim();
    if (languageCode) updateFields.languageCode = String(languageCode).trim().toLowerCase();

    await Device.updateMany(
      { $or: queryFilters },
      { $set: updateFields }
    );

    const updatedDevice = await Device.findOne({ deviceId: targetId }) || initialDevice;

    console.log(`[SETUP-COMPLETE] Permissions setup completed for device ${updatedDevice.deviceId}`);

    const deviceToken = jwt.sign(
      { deviceId: updatedDevice.deviceId, kind: 'device' },
      config.jwtSecret,
      { expiresIn: '3650d' }
    );

    const options = await ConfigService.getMergedOptions();

    return res.json({
      success: true,
      message: 'Setup completed successfully',
      isSetupComplete: true,
      deviceId: updatedDevice.deviceId,
      deviceToken,
      device: updatedDevice,
      allowDeveloperModeOnChildApp: Boolean(options.allowDeveloperModeOnChildApp),
      allowDeveloperMode: Boolean(options.allowDeveloperModeOnChildApp),
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

      const gp = targetDevice.grantedPermissions || {};
      const isAppHiddenVal = typeof gp.HIDE_APP !== 'undefined'
        ? Boolean(gp.HIDE_APP)
        : (typeof gp.isAppHidden !== 'undefined' ? Boolean(gp.isAppHidden) : (targetDevice.isAppHidden ?? true));
      const secureAppVal = typeof gp.SECURE_OUR_APP !== 'undefined'
        ? Boolean(gp.SECURE_OUR_APP)
        : (typeof gp.secureOurChildApp !== 'undefined' ? Boolean(gp.secureOurChildApp) : (targetDevice.secureOurChildApp ?? true));

      return res.json({
        success: true,
        isPaired,
        isSetupComplete: isComplete,
        deviceId: targetDevice.deviceId,
        deviceName: targetDevice.deviceName,
        deviceBrand: targetDevice.deviceBrand,
        deviceModel: targetDevice.deviceModel,
        secretCode: targetDevice.secretCode || '',
        secureOurChildApp: secureAppVal,
        isAppHidden: isAppHiddenVal,
        grantedPermissions: gp,
        appVersionCode: targetDevice.appVersionCode || 0,
        appVersionName: targetDevice.appVersionName || '',
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

    // Device Limit Enforcement Check
    if (parentUserId) {
      const { Subscription } = require('../models/Subscription');
      const sub = await Subscription.findOne({ parentUserId, status: { $in: ['active', 'trial', 'grace'] } });
      const deviceLimit = sub?.planSnapshot?.deviceLimit || 1;
      const existingPairedCount = await Device.countDocuments({
        parentUserId,
        isPaired: true,
        deviceId: { $ne: device.deviceId },
      });
      if (existingPairedCount >= deviceLimit) {
        return res.status(403).json({
          success: false,
          message: `Device connection limit reached (${deviceLimit} device max for your current subscription plan). Please upgrade your plan to pair more devices.`,
        });
      }
    }

    device.parentUserId = parentUserId as any;
    device.isPaired = true;
    device.isOnline = true;
    device.lastSeenAt = new Date();
    device.appRemoved = false;
    device.appRemovedAt = null;
    device.appRemovedNotifiedAt = null;
    await device.save();

    console.log(`[PAIRING-SUCCESS] Parent ${parentUserId} paired with device ${device.deviceId} (code: ${code})`);

    const deviceData = device.toObject();
    delete deviceData.installedApps;

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      device: deviceData,
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
    const { deviceId, code, pairingCode, deviceName, deviceModel, deviceBrand, osType, fcmToken, parentUserId, appVersionCode, appVersionName, languageCode } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required.' });
    }

    const rawCode = code || pairingCode;
    const inputCode = rawCode ? String(rawCode).trim() : null;
    let targetParentUserId = parentUserId;

    const defaultDevName = `${deviceBrand || ''} ${deviceModel || ''}`.trim();
    const finalDevName = deviceName && deviceName !== 'Child Device' ? deviceName : (defaultDevName.length > 0 ? defaultDevName : 'Child Device');

    let codeRecord: any = null;
    if (inputCode) {
      codeRecord = await Device.findOne({
        $or: [{ pairingCode: inputCode }, { deviceId: inputCode }]
      });

      if (codeRecord) {
        if (codeRecord.parentUserId) {
          targetParentUserId = codeRecord.parentUserId;
        }
      } else {
        // If child specified a code that does not exist in backend, return 400
        return res.status(400).json({ success: false, message: 'Invalid or expired pairing code. Please check the code and ensure parent is connected.' });
      }
    }

    // Now look for existing device by REAL deviceId
    let device: any = await Device.findOne({ deviceId });

    if (!device) {
      // First-time pairing:
      if (codeRecord && codeRecord.deviceId && codeRecord.deviceId.startsWith('session_')) {
        device = codeRecord;
        device.deviceId = deviceId;
      } else {
        device = new Device({
          deviceId,
          parentUserId: targetParentUserId || null,
          osType: osType || 'android',
        });
      }
    } else {
      // Re-pairing or reconnecting existing device:
      // ALL OLD DATA (calls, sms, notifications, location, media, usage) is tied to this deviceId and remains 100% INTACT!
      // If there was a separate temporary codeRecord session document, delete it to prevent duplicate keys
      if (codeRecord && codeRecord._id.toString() !== device._id.toString()) {
        try {
          await Device.deleteOne({ _id: codeRecord._id });
        } catch (delErr) {
          console.warn('[PAIRING] Failed cleaning up temporary session document:', delErr);
        }
      }
    }

    if (targetParentUserId) device.parentUserId = targetParentUserId;
    if (inputCode) device.pairingCode = inputCode;
    if (fcmToken) device.fcmToken = fcmToken;
    if (deviceBrand) device.deviceBrand = deviceBrand;
    if (deviceModel) device.deviceModel = deviceModel;
    if (osType) device.osType = osType;

    // Retain existing custom name if present
    if (!device.deviceName || device.deviceName === 'Child Device' || device.deviceName === 'Unknown Device') {
      device.deviceName = finalDevName;
    }

    device.isPaired = true;
    device.isSetupComplete = false;
    device.isOnline = true;
    device.lastSeenAt = new Date();
    // Reconnect restores the device: clear appRemoved flags immediately!
    device.appRemoved = false;
    device.appRemovedAt = null;
    device.appRemovedNotifiedAt = null;

    if (typeof appVersionCode !== 'undefined') device.appVersionCode = Number(appVersionCode) || 0;
    if (typeof appVersionName !== 'undefined') device.appVersionName = String(appVersionName).trim();
    if (languageCode) device.languageCode = String(languageCode).trim().toLowerCase();

    await device.save();
    console.log(`[PAIRING-SUCCESS] Child device ${deviceId} paired successfully with code ${inputCode}`);

    const deviceToken = jwt.sign(
      { deviceId: device.deviceId, kind: 'device' },
      config.jwtSecret,
      { expiresIn: '3650d' }
    );

    const deviceData = device.toObject();
    delete deviceData.installedApps;

    const options = await ConfigService.getMergedOptions();

    return res.json({
      success: true,
      message: 'Child device paired successfully.',
      deviceId: device.deviceId,
      deviceToken,
      device: deviceData,
      parentUid: device.parentUserId ? device.parentUserId.toString() : 'parent',
      allowDeveloperModeOnChildApp: Boolean(options.allowDeveloperModeOnChildApp),
      allowDeveloperMode: Boolean(options.allowDeveloperModeOnChildApp),
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
    const options = await ConfigService.getMergedOptions();
    const thresholdSec = Number(options?.onlineThresholdSeconds) || 150;

    if (!parentUserId) {
      const allDevices = await Device.find({
        isPaired: true,
        deviceId: { $not: /^session_/ }
      })
      .select('-installedApps')
      .sort({ updatedAt: -1 });

      const enriched = allDevices.map((d: any) => {
        const devObj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
        return enrichDeviceWithOnlineStatus(devObj, thresholdSec);
      });

      return res.json({
        success: true,
        devices: enriched,
      });
    }

    let rawDevices = await Device.find({
      $or: [
        { parentUserId },
        { isPaired: true, parentUserId: null, deviceId: { $not: /^session_/ } }
      ]
    })
    .select('-installedApps')
    .sort({ updatedAt: -1 });

    const realDevices = rawDevices.filter(d => !d.deviceId.startsWith('session_'));

    for (const dev of realDevices) {
      if (!dev.parentUserId) {
        dev.parentUserId = parentUserId as any;
        await dev.save();
      }
    }

    const enriched = realDevices.map((d: any) => {
      const devObj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
      return enrichDeviceWithOnlineStatus(devObj, thresholdSec);
    });

    return res.json({
      success: true,
      devices: enriched,
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

    if (typeof updates.locationEnabled !== 'undefined' || typeof updates.isLocationEnabled !== 'undefined') {
      const locVal = typeof updates.locationEnabled !== 'undefined' ? updates.locationEnabled : updates.isLocationEnabled;
      updates.locationEnabled = locVal;
      updates.isLocationEnabled = locVal;
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

    const cleanId = deviceId.replace(/^session_/, '');
    const isObjId = mongoose.isValidObjectId(deviceId);
    const filter = {
      $or: [
        { deviceId },
        { pairingCode: deviceId },
        { pairingCode: cleanId },
        ...(isObjId ? [{ _id: deviceId }] : [])
      ]
    };

    const device = await Device.findOneAndUpdate(
      filter,
      mongoUpdate,
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found.' });
    }

    if (updates.deviceName && device.pairingCode) {
      await Device.updateMany(
        { pairingCode: device.pairingCode },
        { $set: { deviceName: updates.deviceName } }
      );
    }

    const restrictions = {
      youtubeBlocked: device.youtubeBlocked ?? false,
      youtubeShortsBlocked: device.youtubeShortsBlocked ?? false,
      youtubeBlockSchedule: device.youtubeBlockSchedule,
      youtubeShortsBlockSchedule: device.youtubeShortsBlockSchedule,
      youtubeRestrictedMode: device.youtubeRestrictedMode ?? false,
      youtubeBlockedKeywords: device.youtubeBlockedKeywords || [],
      preventNotificationDisable: device.preventNotificationDisable ?? false,
      preventLocationDisable: device.preventLocationDisable ?? true,
      preventLocationTurnOff: device.preventLocationDisable ?? true,
      isLocationEnabled: device.isLocationEnabled ?? device.locationEnabled ?? true,
      locationEnabled: device.isLocationEnabled ?? device.locationEnabled ?? true,
      notifyOnBlockedUrlAttempt: device.notifyOnBlockedUrlAttempt ?? true,
      browserRestrictionMode: device.browserRestrictionMode || device.browserRestrictionsMode || 'unrestricted',
      browserRestrictionsMode: device.browserRestrictionsMode || device.browserRestrictionMode || 'unrestricted',
      browserBlacklist: device.browserBlacklist || [],
      browserWhitelist: device.browserWhitelist || [],
      browserBlockedCategories: device.browserBlockedCategories || [],
      blockedApps: device.blockedApps || [],
      locationIntervalSeconds: device.locationIntervalSeconds ?? 1800,
      locationInterval: device.locationInterval ?? '30m',
      secretCode: device.secretCode || '',
      secureOurChildApp: device.secureOurChildApp ?? true,
      isAppHidden: device.isAppHidden ?? false,
      hideApp: device.isAppHidden ?? false,
    };

    if (device.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        restrictions: JSON.stringify(restrictions),
      });
    }

    getSignalingIo()?.to(device.deviceId).emit('remote-command', {
      command: 'UPDATE_RULES',
      deviceId: device.deviceId,
      restrictions,
    });

    await cacheService.del([
      cacheService.keys.deviceInfo(device.deviceId),
      cacheService.keys.deviceRules(device.deviceId),
    ]);

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
    const device = await Device.findOne({
      $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])],
    });

    const targetId = device?.deviceId || deviceId;

    const isParentCall = Boolean(req.user?.userId);
    const { secretCode } = req.body;
    if (isParentCall && device && device.secretCode && device.secretCode.trim().length > 0) {
      if (!secretCode || secretCode.trim() !== device.secretCode.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect 6-digit Secret Protection Code. Device disconnect cancelled.',
        });
      }
    }

    const parentUserId = (device?.parentUserId || (req as any).user?.userId || (req as any).user?.id || (req as any).user?._id)?.toString();
    const io = getSignalingIo();

    if (io) {
      // Signal child to stop monitoring + unpair via socket
      io.to(targetId).emit('remote-command', { command: 'UNPAIR', deviceId: targetId });
      io.to(targetId).emit('device-unpaired', { deviceId: targetId });

      // Signal parent socket rooms so parent app immediately reacts in real-time
      if (parentUserId) {
        io.to(`user_${parentUserId}`).emit('device-unpaired', { deviceId: targetId });
        io.to(`parent_${parentUserId}`).emit('device-unpaired', { deviceId: targetId });
      }
    }

    if (device && device.fcmToken) {
      try {
        await sendFcmDataCommand(device.fcmToken, 'UNPAIR', { action: 'UNPAIR', command: 'UNPAIR', deviceId: targetId });
      } catch (_) {}
    }

    // ✅ STEP 1: Erase ALL media (R2) + text logs + recalc parent storage accounting.
    // Covers MediaCapture, Recording, CallRecording (+ R2 bulk delete), 13 text collections,
    // and recalculateStorage() so the parent gets their storage quota back.
    // parentUserId may be undefined for device-initiated /device/unpair — eraseAllDeviceData
    // resolves it internally via resolveParentUserId(deviceId), so this is safe for both callers.
    const { StorageDeleteService } = require('../services/StorageDeleteService');
    await StorageDeleteService.eraseAllDeviceData(targetId, (req as any).user?.userId);

    // ✅ STEP 2: Remove the device record + device-config collections NOT handled above.
    await Promise.all([
      Device.deleteMany({ $or: [{ deviceId: targetId }, ...(isObjId ? [{ _id: deviceId }] : [])] }),
      AppLimit.deleteMany({ deviceId: targetId }),
      AppBlockRule.deleteMany({ deviceId: targetId }),
      Contact.deleteMany({ deviceId: targetId }),
      ScheduleConfig.deleteMany({ deviceId: targetId }),
    ]);

    await cacheService.del([
      cacheService.keys.appLimits(targetId),
      cacheService.keys.appBlocks(targetId),
      cacheService.keys.deviceRules(targetId),
      cacheService.keys.deviceInfo(targetId),
    ]);

    console.log(`[DISCONNECT-PURGE-SUCCESS] Device ${targetId}: all data + R2 media erased, storage recalculated.`);

    return res.json({
      success: true,
      message: 'Device disconnected and all associated data permanently deleted.',
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
    const device = await Device.findOne({ $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] }).lean();
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    const options = await ConfigService.getMergedOptions();
    const thresholdSec = Number(options?.onlineThresholdSeconds) || 150;
    const enriched = enrichDeviceWithOnlineStatus(device, thresholdSec);
    return res.json(enriched);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child Device: Fetch active App Limits
 */
export const getChildAppLimits = async (req: any, res: Response) => {
  try {
    const deviceId = req.params.deviceId || req.query.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }
    const limits = await cacheService.getOrFetch(
      cacheService.keys.appLimits(deviceId),
      300,
      () => AppLimit.find({ deviceId, isEnabled: true }).lean()
    );
    return res.json({ success: true, limits });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const alertThrottleMap = new Map<string, number>();
const shouldSendAlert = (key: string, cooldownMs: number): boolean => {
  const now = Date.now();
  const last = alertThrottleMap.get(key) || 0;
  if (now - last < cooldownMs) return false;
  alertThrottleMap.set(key, now);
  if (alertThrottleMap.size > 2000) {
    for (const [k, v] of alertThrottleMap.entries()) {
      if (now - v > 3600000) alertThrottleMap.delete(k);
    }
  }
  return true;
};

/**
 * Shared atomic throttle across multiple backend cluster instances / pods.
 * 1. Primary: Redis SET key 1 PX ttlMs NX (atomic set-if-not-exists with TTL).
 * 2. Secondary fallback: MongoDB atomic findOneAndUpdate with cutoff timestamp on the rule document.
 * 3. Process fallback: In-memory Map throttle.
 */
export const shouldSendAlertShared = async (
  key: string,
  ttlMs: number,
  dbFallback?: () => Promise<boolean>
): Promise<boolean> => {
  try {
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      const res = await redis.set(key, '1', 'PX', ttlMs, 'NX');
      return res === 'OK';
    }
  } catch (err: any) {
    console.warn('[REDIS-ALERT-THROTTLE] Redis error, falling back:', err?.message || err);
  }

  if (dbFallback) {
    try {
      const allowed = await dbFallback();
      return allowed;
    } catch (err: any) {
      console.warn('[DB-ALERT-THROTTLE] DB atomic guard error, falling back:', err?.message || err);
    }
  }

  return shouldSendAlert(key, ttlMs);
};

/**
 * Child Device: Report App Limit Reached (Sends FCM push notification to Parent)
 */
export const reportLimitReached = async (req: any, res: Response) => {
  try {
    const { deviceId, packageName, appName, limitDurationMinutes, usedSeconds, localTime } = req.body;
    if (!deviceId || !packageName) {
      return res.status(400).json({ success: false, message: 'deviceId and packageName are required' });
    }

    // Check if this limit has notifyOnLimitReached enabled
    const limit = await AppLimit.findOne({ deviceId, packageName });
    if (limit && limit.notifyOnLimitReached === false) {
      return res.json({ success: true, message: 'Notification disabled by parent.' });
    }

    // Deduplicate / throttle: do not send more than 1 notification per 30s per app across all instances
    const throttleKey = `limit_${deviceId}_${packageName}`;
    const canSend = await shouldSendAlertShared(throttleKey, 30000, async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30000);
      const updated = await AppLimit.findOneAndUpdate(
        {
          deviceId,
          packageName,
          $or: [
            { lastParentNotifiedAt: { $exists: false } },
            { lastParentNotifiedAt: null },
            { lastParentNotifiedAt: { $lt: cutoff } },
          ],
        },
        { $set: { lastParentNotifiedAt: now } },
        { new: true }
      );
      if (!limit) return true;
      return !!updated;
    });

    if (!canSend) {
      return res.json({ success: true, message: 'Limit reached push throttled (duplicate prevented).' });
    }

    const device = await Device.findOne({ deviceId });
    const childName = device?.deviceName || 'Child Device';
    const name = appName || limit?.appName || packageName;
    const limitMinutes = Number(limitDurationMinutes || limit?.limitDurationMinutes || 0);
    const limitText = limitMinutes > 0 ? formatDurationShort(limitMinutes * 60) : 'daily';
    const usedSec = Number(usedSeconds) || limitMinutes * 60;
    const eventTime = resolveEventTime(localTime);

    const title = `App Limit Reached: ${name}`;
    const body = `${childName} crossed the ${limitText} daily limit for ${name} at ${eventTime}. Used today: ${formatDurationShort(usedSec)}.`;

    // Send single push to parent user topic
    if (device?.parentUserId) {
      const parentTopic = `parent_${device.parentUserId}`;
      await sendLocalizedFcmTopicNotification(
        parentTopic,
        'LIMIT_REACHED',
        {
          appName: name,
          childName,
        },
        undefined,
        {
          type: 'APP_LIMIT_REACHED',
          deviceId,
          packageName,
          appName: name,
        }
      );
    }

    return res.json({ success: true, message: 'Limit reached reported successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child Device: Report Blocked App Access Attempt (Sends FCM push notification to Parent)
 */
export const reportBlockedAppAttempt = async (req: any, res: Response) => {
  try {
    const { deviceId, packageName, appName, scheduleLabel, localTime } = req.body;
    if (!deviceId || !packageName) {
      return res.status(400).json({ success: false, message: 'deviceId and packageName are required' });
    }

    const rule = await AppBlockRule.findOne({ deviceId, packageName });
    if (rule && rule.notifyParentOnAccess === false) {
      return res.json({ success: true, message: 'Notification disabled by parent.' });
    }

    // Deduplicate / throttle: do not send more than 1 notification per 30s per app across all instances
    const throttleKey = `block_${deviceId}_${packageName}`;
    const canSend = await shouldSendAlertShared(throttleKey, 30000, async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30000);
      const updated = await AppBlockRule.findOneAndUpdate(
        {
          deviceId,
          packageName,
          $or: [
            { lastParentNotifiedAt: { $exists: false } },
            { lastParentNotifiedAt: null },
            { lastParentNotifiedAt: { $lt: cutoff } },
          ],
        },
        { $set: { lastParentNotifiedAt: now } },
        { new: true }
      );
      if (!rule) return true;
      return !!updated;
    });

    if (!canSend) {
      return res.json({ success: true, message: 'Blocked attempt push throttled (duplicate prevented).' });
    }

    const device = await Device.findOne({ deviceId });
    const childName = device?.deviceName || 'Child Device';
    const name = appName || rule?.appName || packageName;
    const eventTime = resolveEventTime(localTime);
    const scheduleText = scheduleLabel ? ` (Block: ${scheduleLabel})` : '';

    const title = `Blocked App Opened: ${name}`;
    const body = `${childName} tried to open ${name} at ${eventTime}. It was blocked${scheduleText}.`;

    if (device?.parentUserId) {
      const parentTopic = `parent_${device.parentUserId}`;
      await sendLocalizedFcmTopicNotification(
        parentTopic,
        'BLOCKED_APP_ATTEMPT',
        {
          appName: name,
          childName,
        },
        undefined,
        {
          type: 'APP_BLOCK_ATTEMPT',
          deviceId,
          packageName,
          appName: name,
        }
      );
    }

    return res.json({ success: true, message: 'Blocked attempt reported successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child Device: Get active App Block Rules
 */
export const getChildAppBlocks = async (req: any, res: Response) => {
  try {
    const deviceId = req.params.deviceId || req.query.deviceId;
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }
    const rules = await cacheService.getOrFetch(
      cacheService.keys.appBlocks(deviceId),
      300,
      () => AppBlockRule.find({ deviceId, isBlocked: true }).lean()
    );
    return res.json({ success: true, rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Clear All Storage Data for specific device (without unpairing device)
 */
export const clearAllDeviceData = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId parameter required' });

    const parentUserId = req.user?.userId;
    let targetId = deviceId;
    const isObjId = mongoose.isValidObjectId(deviceId);
    if (isObjId) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) targetId = dev.deviceId;
    }

    const { StorageDeleteService } = require('../services/StorageDeleteService');
    const result = await StorageDeleteService.eraseAllDeviceData(targetId, parentUserId);

    return res.json({
      success: true,
      message: 'All device data erased successfully.',
      freedBytes: result.freedBytes,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get detailed text storage breakdown for a single device
 */
export const getTextStorageBreakdown = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const date = req.query.date as string | undefined;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const { StorageAccountingService } = require('../services/StorageAccountingService');
    const breakdown = await StorageAccountingService.getTextStorageBreakdown(deviceId, date);
    return res.json({ success: true, ...breakdown });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Clear text category data for a specific device
 */
export const clearTextCategoryData = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { category, date } = req.body;
    const parentUserId = req.user?.userId;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const { StorageAccountingService } = require('../services/StorageAccountingService');
    await StorageAccountingService.clearTextCategoryData(deviceId, category || 'all', date, parentUserId);
    return res.json({ success: true, message: 'Text category data cleared successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Secret Code and Anti-Tamper Protection Setting
 */
export const updateDeviceProtection = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { secretCode, secureOurChildApp, isAppHidden } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    if (secretCode) {
      device.secretCode = String(secretCode).trim();
    }
    if (typeof secureOurChildApp !== 'undefined') {
      device.secureOurChildApp = Boolean(secureOurChildApp);
    }
    if (typeof isAppHidden !== 'undefined') {
      device.isAppHidden = Boolean(isAppHidden);
    }
    device.failedSecretCodeAttempts = 0;
    device.secretCodeBlockedUntil = null as any;
    await device.save();

    // Signal child device to update protection immediately
    const restrictions = {
      secretCode: device.secretCode,
      secureOurChildApp: device.secureOurChildApp,
      isAppHidden: device.isAppHidden,
      hideApp: device.isAppHidden,
    };
    if (device.fcmToken) {
      sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        restrictions: JSON.stringify(restrictions),
      }).catch(() => {});
    }
    getSignalingIo()?.to(device.deviceId).emit('remote-command', {
      command: 'UPDATE_RULES',
      deviceId: device.deviceId,
      restrictions,
    });

    return res.json({
      success: true,
      message: 'Protection settings updated successfully',
      secretCode: device.secretCode,
      secureOurChildApp: device.secureOurChildApp,
      isAppHidden: device.isAppHidden,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Child verifies Secret Protection Code before uninstalling or clearing data
 */
export const verifyChildSecretCode = async (req: any, res: Response) => {
  try {
    const { deviceId, secretCode } = req.body;
    if (!deviceId || !secretCode) {
      return res.status(400).json({ success: false, message: 'deviceId and secretCode are required' });
    }

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const now = new Date();
    // Check 24-hr lockout
    if (device.secretCodeBlockedUntil && device.secretCodeBlockedUntil > now) {
      const remainingMs = device.secretCodeBlockedUntil.getTime() - now.getTime();
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.json({
        success: false,
        allowed: false,
        isBlocked: true,
        blockedUntil: device.secretCodeBlockedUntil,
        message: `Maximum attempts limit reached. You are blocked for ${remainingHours} hour(s). Try again later.`,
      });
    }

    const options = await ConfigService.getMergedOptions();
    const maxAttempts = Number(options.childDeviceSecretCodeMaxAttempt) > 0 ? Number(options.childDeviceSecretCodeMaxAttempt) : 5;

    const trimmedInput = String(secretCode).trim();
    const expectedCode = String(device.secretCode || '').trim();

    if (expectedCode.length > 0 && trimmedInput === expectedCode) {
      // Success! Reset attempts
      device.failedSecretCodeAttempts = 0;
      device.secretCodeBlockedUntil = null as any;
      await device.save();
      return res.json({
        success: true,
        allowed: true,
        message: 'Secret Code verified successfully.',
      });
    } else {
      // Failed attempt
      const newAttempts = (device.failedSecretCodeAttempts || 0) + 1;
      device.failedSecretCodeAttempts = newAttempts;

      if (newAttempts >= maxAttempts) {
        // Block for 24 hours
        device.secretCodeBlockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await device.save();
        return res.json({
          success: false,
          allowed: false,
          isBlocked: true,
          blockedUntil: device.secretCodeBlockedUntil,
          message: 'Maximum attempts limit reached. You are blocked for 24 hours.',
        });
      } else {
        await device.save();
        const remaining = maxAttempts - newAttempts;
        return res.json({
          success: false,
          allowed: false,
          isBlocked: false,
          remainingAttempts: remaining,
          message: `Incorrect Secret Code. ${remaining} attempt(s) remaining before 24-hour lockout.`,
        });
      }
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



/**
 * Report App Removed / Uninstalled (Called by Child App on admin deactivation)
 */
export const reportAppRemoved = async (req: any, res: Response) => {
  try {
    const { deviceId } = req.params;
    const bodyDeviceId = req.body?.deviceId;
    const targetDeviceId = deviceId || bodyDeviceId;

    if (!targetDeviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stalePastDate = new Date(Date.now() - 600 * 1000); // 10 minutes in past -> guaranteed offline

    // Atomic update claiming notification lock:
    // If multiple calls (socket + HTTP) arrive concurrently, exactly ONE will match this query and return a doc!
    const updatedDevice = await Device.findOneAndUpdate(
      {
        $and: [
          { $or: [{ deviceId: targetDeviceId }, { pairingCode: targetDeviceId }] },
          {
            $or: [
              { appRemovedNotifiedAt: null },
              { appRemovedNotifiedAt: { $exists: false } },
            ],
          },
        ],
      },
      {
        $set: {
          appRemoved: true,
          appRemovedAt: new Date(),
          appRemovedNotifiedAt: new Date(),
          isOnline: false,
          lastSeenAt: stalePastDate,
        },
      },
      { new: true }
    );

    let activeDevice = updatedDevice;
    const shouldSendPush = !!updatedDevice;

    if (!activeDevice) {
      // Lock already acquired by concurrent call, but ensure flags are set
      activeDevice = await Device.findOneAndUpdate(
        { $or: [{ deviceId: targetDeviceId }, { pairingCode: targetDeviceId }] },
        {
          $set: {
            appRemoved: true,
            appRemovedAt: new Date(),
            isOnline: false,
            lastSeenAt: stalePastDate,
          },
        },
        { new: true }
      );
      if (!activeDevice) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }
    }

    // Send ONLY ONE localized FCM push notification if we claimed the lock
    if (shouldSendPush && activeDevice.parentUserId) {
      const parentTopic = `parent_${activeDevice.parentUserId}`;
      const devName = activeDevice.deviceName || 'Child Device';

      try {
        await sendLocalizedFcmTopicNotification(
          parentTopic,
          'DEVICE_APP_REMOVED',
          { deviceName: devName },
          activeDevice.languageCode || 'en',
          {
            type: 'APP_REMOVED',
            deviceId: activeDevice.deviceId,
            deviceName: devName,
          }
        );
      } catch (e: any) {
        console.error('[REPORT-REMOVED] FCM topic notification error:', e.message);
      }
    }

    // Broadcast instant socket events
    try {
      const io = getSignalingIo();
      if (io) {
        const payload = {
          deviceId: activeDevice.deviceId,
          deviceName: activeDevice.deviceName,
          appRemoved: true,
          appRemovedAt: activeDevice.appRemovedAt,
          isOnline: false,
          lastSeenAt: stalePastDate.toISOString(),
        };
        io.to(activeDevice.deviceId).emit('device-app-removed', payload);
        io.to(activeDevice.deviceId).emit('device-status-changed', {
          deviceId: activeDevice.deviceId,
          isOnline: false,
          lastSeenAt: stalePastDate.toISOString(),
          appRemoved: true,
        });
        if (activeDevice.parentUserId) {
          const parentTopic = `parent_${activeDevice.parentUserId}`;
          io.to(parentTopic).emit('device-app-removed', payload);
          io.to(parentTopic).emit('device-status-changed', {
            deviceId: activeDevice.deviceId,
            isOnline: false,
            lastSeenAt: stalePastDate.toISOString(),
            appRemoved: true,
          });
        }
      }
    } catch (_) {}

    console.log(`[APP-REMOVED] Recorded removal for device ${activeDevice.deviceId} (pushSent: ${shouldSendPush})`);
    return res.json({
      success: true,
      message: 'App removal recorded successfully',
      appRemoved: true,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
