import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { CallRecording } from '../models/CallRecording';
import { MediaCapture } from '../models/MediaCapture';
import { AppUsage } from '../models/AppUsage';
import { Contact } from '../models/Contact';
import { SocialMessage } from '../models/SocialMessage';
import { Device } from '../models/Device';
import { uploadMediaToR2 } from '../services/r2.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';

/**
 * Update Heartbeat & Online Status from Child Device
 */
export const updateHeartbeat = async (req: Request, res: Response) => {
  try {
    const { deviceId, batteryLevel, isCharging } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const isObjId = mongoose.isValidObjectId(deviceId);
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, ...(isObjId ? [{ _id: deviceId }] : [])] },
      {
        $set: {
          batteryLevel: batteryLevel ?? 100,
          isCharging: isCharging ?? false,
          isOnline: true,
          lastSeenAt: new Date(),
        },
      },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    return res.json({
      success: true,
      message: 'Heartbeat updated.',
      restrictions: {
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
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Batch Upload Browser History Logs
 */
export const ingestBrowserHistory = async (req: Request, res: Response) => {
  try {
    const rawLogs = req.body.logs || req.body.events || (Array.isArray(req.body) ? req.body : []);
    const topDeviceId = req.body.deviceId;
    if (!Array.isArray(rawLogs)) {
      return res.status(400).json({ success: false, message: 'Invalid payload format' });
    }

    const sessionDocs: any[] = [];
    const plainDocs: any[] = [];

    for (const item of rawLogs) {
      const deviceId = item.deviceId || topDeviceId;
      if (!deviceId || !item.url) continue;

      const docData: any = {
        deviceId,
        url: item.url,
        domain: item.domain || item.url,
        title: item.title,
        browserPackage: item.browserPackage || 'browser',
        browserName: item.browserName || 'Browser',
        blocked: item.blocked || false,
        blockReason: item.blockReason,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      };

      if (item.sessionId) {
        docData.sessionId = item.sessionId;
        if (item.startTime) docData.startTime = new Date(item.startTime);
        if (item.endTime !== undefined) docData.endTime = item.endTime ? new Date(item.endTime) : null;
        if (typeof item.durationSeconds === 'number') docData.durationSeconds = Math.max(0, item.durationSeconds);
        if (typeof item.isCurrentlyActive === 'boolean') docData.isCurrentlyActive = item.isCurrentlyActive;
        sessionDocs.push(docData);
      } else {
        plainDocs.push(docData);
      }
    }

    const insertedOrUpdated: any[] = [];

    for (const sDoc of sessionDocs) {
      const resDoc = await BrowserHistory.findOneAndUpdate(
        { deviceId: sDoc.deviceId, sessionId: sDoc.sessionId },
        { $set: sDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (resDoc) insertedOrUpdated.push(resDoc);
    }

    if (plainDocs.length > 0) {
      const inserted = await BrowserHistory.insertMany(plainDocs);
      insertedOrUpdated.push(...inserted);
    }

    const blockedDocs = insertedOrUpdated.filter((d: any) => d.blocked);
    if (blockedDocs.length > 0) {
      const io = getSignalingIo();
      if (io) {
        blockedDocs.forEach((bd: any) => {
          io.to(bd.deviceId).emit('blocked-attempt', bd);
        });
      }
    }

    return res.json({ success: true, count: insertedOrUpdated.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Batch Upload YouTube History Logs
 */
export const ingestYouTubeHistory = async (req: Request, res: Response) => {
  try {
    const rawLogs = req.body.logs || req.body.events || (Array.isArray(req.body) ? req.body : []);
    const topDeviceId = req.body.deviceId;
    if (!Array.isArray(rawLogs)) {
      return res.status(400).json({ success: false, message: 'Invalid payload format' });
    }

    const docs = rawLogs.map((item: any) => ({
      deviceId: item.deviceId || topDeviceId,
      videoId: item.videoId,
      videoUrl: item.videoUrl,
      title: item.title || 'YouTube Video',
      channelName: item.channelName,
      duration: item.duration,
      description: item.description,
      isShorts: item.isShorts || item.isShort || false,
      isVideo: item.isVideo !== false,
      watchedDurationSeconds: item.watchedDurationSeconds || 0,
      endedAt: item.endedAt ? new Date(item.endedAt) : undefined,
      source: item.source || 'YouTube App',
      thumbnailBase64: item.thumbnailBase64,
      blocked: item.blocked || false,
      blockReason: item.blockReason,
      timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
    })).filter((d: any) => d.deviceId && d.title);

    if (docs.length > 0) {
      const inserted = await YouTubeHistory.insertMany(docs);
      const blockedDocs = inserted.filter((d: any) => d.blocked);
      if (blockedDocs.length > 0) {
        const io = getSignalingIo();
        if (io) {
          blockedDocs.forEach((bd: any) => {
            io.to(bd.deviceId).emit('blocked-attempt', bd);
          });
        }
      }
    }

    return res.json({ success: true, count: docs.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Batch Upload YouTube App Open/Close Sessions
 */
export const ingestYouTubeSession = async (req: Request, res: Response) => {
  try {
    const rawSessions = req.body.sessions || req.body.logs || (Array.isArray(req.body) ? req.body : [req.body]);
    const topDeviceId = req.body.deviceId;
    if (!Array.isArray(rawSessions)) {
      return res.status(400).json({ success: false, message: 'Invalid payload format' });
    }

    const docs = rawSessions.map((item: any) => {
      const start = item.startTime ? new Date(item.startTime) : new Date();
      const end = item.endTime ? new Date(item.endTime) : new Date();
      const dateStr = item.date || start.toISOString().split('T')[0];
      return {
        deviceId: item.deviceId || topDeviceId,
        startTime: start,
        endTime: end,
        durationSeconds: item.durationSeconds || Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000)),
        date: dateStr,
        packageName: item.packageName || 'com.google.android.youtube',
        source: item.source || 'YouTube App',
        blocked: item.blocked || false,
        blockReason: item.blockReason,
      };
    }).filter((d: any) => d.deviceId && d.startTime && d.endTime);

    if (docs.length > 0) {
      await YouTubeSession.insertMany(docs);
    }

    return res.json({ success: true, count: docs.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Upload Screenshot / Front Photo / Back Photo (Stores in Cloudflare R2, zero download fees)
 */
export const uploadCapturedMedia = async (req: Request, res: Response) => {
  try {
    const deviceId = req.body.deviceId;
    const type = req.body.type || req.body.captureType || 'screenshot';
    const imageBase64 = req.body.imageBase64 || req.body.base64Image;
    const timestamp = req.body.timestamp;

    if (!deviceId || !imageBase64) {
      return res.status(400).json({ success: false, message: 'Missing required media parameters (deviceId, imageBase64)' });
    }

    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const folderName = `captures/${type}/${deviceId}`;
    const mediaUrl = await uploadMediaToR2(buffer, folderName, 'webp', 'image/webp');

    const capture = new MediaCapture({
      deviceId,
      type,
      mediaUrl,
      fileSizeBytes: buffer.length,
      mimeType: 'image/webp',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await capture.save();

    console.log(`[MEDIA-UPLOAD] Captured ${type} uploaded for device ${deviceId}: ${mediaUrl}`);

    return res.json({
      success: true,
      mediaUrl,
      captureId: capture._id,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Batch Ingest Contacts / Call Logs / Social Messages
 */
export const ingestGeneralLogs = async (req: Request, res: Response) => {
  try {
    const { deviceId, contacts, callLogs, socialMessages, appUsage } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    if (Array.isArray(contacts) && contacts.length > 0) {
      const docs = contacts.map((c) => ({
        deviceId,
        name: c.name,
        phoneNumber: c.phoneNumber,
        isBlocked: c.isBlocked || false,
      }));
      await Contact.deleteMany({ deviceId }); // Fresh sync
      await Contact.insertMany(docs);
    }

    if (Array.isArray(callLogs) && callLogs.length > 0) {
      const docs = callLogs.map((cl) => ({
        deviceId,
        phoneNumber: cl.phoneNumber,
        contactName: cl.contactName,
        callType: cl.callType || 'incoming',
        durationSeconds: cl.durationSeconds || 0,
        timestamp: cl.timestamp ? new Date(cl.timestamp) : new Date(),
      }));
      await CallLog.insertMany(docs);
    }

    if (Array.isArray(socialMessages) && socialMessages.length > 0) {
      const docs = socialMessages.map((sm) => ({
        deviceId,
        packageName: sm.packageName,
        appName: sm.appName || 'Social App',
        contactName: sm.contactName || 'Contact',
        sender: sm.sender || 'Sender',
        messageText: sm.messageText || '',
        isOutgoing: sm.isOutgoing || false,
        timestamp: sm.timestamp ? new Date(sm.timestamp) : new Date(),
      }));
      await SocialMessage.insertMany(docs);
    }

    if (Array.isArray(appUsage) && appUsage.length > 0) {
      const docs = appUsage.map((au) => ({
        deviceId,
        appName: au.appName,
        packageName: au.packageName,
        category: au.category,
        usageDurationSeconds: au.usageDurationSeconds || 0,
        date: au.date || new Date().toISOString().split('T')[0],
        timestamp: au.timestamp ? new Date(au.timestamp) : new Date(),
      }));
      await AppUsage.insertMany(docs);
    }

    return res.json({ success: true, message: 'Batch logs ingested successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ingest Call Logs from Child App
 */
export const ingestCallLogs = async (req: Request, res: Response) => {
  try {
    const rawLogs = req.body.logs || req.body.callLogs || (Array.isArray(req.body) ? req.body : []);
    const topDeviceId = req.body.deviceId;

    if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty call logs payload' });
    }

    const insertedOrUpdated: any[] = [];

    // Check device's current blocked phone numbers
    const targetDeviceId = topDeviceId || rawLogs[0]?.deviceId;
    const device = await Device.findOne({ deviceId: targetDeviceId });
    const blockedNumbersSet = new Set((device?.blockedPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '')));
    const lastClearedTime = device?.lastCallHistoryClearedAt ? new Date(device.lastCallHistoryClearedAt).getTime() : 0;

    for (const item of rawLogs) {
      const deviceId = item.deviceId || topDeviceId;
      if (!deviceId || !item.phoneNumber) continue;

      const startTime = item.startTime ? new Date(item.startTime) : (item.timestamp ? new Date(item.timestamp) : new Date());
      // If parent previously cleared all call history, don't re-ingest background logs older than the clear time
      if (lastClearedTime > 0 && startTime.getTime() <= lastClearedTime) {
        continue;
      }

      const cleanNum = item.phoneNumber.replace(/[^0-9]/g, '');
      const isBlocked = cleanNum.length >= 10 && blockedNumbersSet.has(cleanNum.slice(-10));
      const rawType = (item.callType || 'incoming').toLowerCase();
      const callType = isBlocked ? 'blocked' : (rawType === 'blocked' || rawType === 'rejected' ? 'missed' : rawType);

      const callId = item.callId || `${deviceId}_${item.phoneNumber}_${new Date(item.timestamp || item.startTime || Date.now()).getTime()}`;

      let endTime = item.endTime ? new Date(item.endTime) : null;
      const durationSeconds = typeof item.durationSeconds === 'number' ? Math.max(0, item.durationSeconds) : 0;
      if (!endTime && durationSeconds > 0) {
        endTime = new Date(startTime.getTime() + durationSeconds * 1000);
      }

      const docData: any = {
        deviceId,
        callId,
        phoneNumber: item.phoneNumber,
        contactName: item.contactName || '',
        callType,
        startTime,
        endTime,
        durationSeconds,
        isBlocked: !!isBlocked,
        simDisplayName: item.simDisplayName || '',
        timestamp: startTime,
      };

      const resDoc = await CallLog.findOneAndUpdate(
        { deviceId, callId },
        { $set: docData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (resDoc) insertedOrUpdated.push(resDoc);
    }

    return res.json({ success: true, count: insertedOrUpdated.length });
  } catch (error: any) {
    console.error('[INGEST-CALL-LOGS] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ingest Contacts from Child App
 */
export const ingestContacts = async (req: Request, res: Response) => {
  try {
    const rawContacts = req.body.contacts || (Array.isArray(req.body) ? req.body : []);
    const topDeviceId = req.body.deviceId;
    const isFullSync = req.body.isFullSync === true;

    if (!Array.isArray(rawContacts) || (rawContacts.length === 0 && !isFullSync)) {
      return res.status(400).json({ success: false, message: 'Invalid or empty contacts payload' });
    }

    const targetDeviceId = topDeviceId || rawContacts[0]?.deviceId;
    if (!targetDeviceId) {
      return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    // If full sync and contacts array is empty, all contacts were deleted on device
    if (isFullSync && rawContacts.length === 0) {
      await Contact.deleteMany({ deviceId: targetDeviceId });
      return res.json({ success: true, count: 0, reconciled: true });
    }

    const device = await Device.findOne({ deviceId: targetDeviceId });
    const blockedNumbersSet = new Set((device?.blockedPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '')));
    const blockedOutgoingNumbersSet = new Set((device?.blockedOutgoingPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '')));

    const operations: any[] = [];
    const activeNumbers: string[] = [];

    for (const c of rawContacts) {
      const deviceId = c.deviceId || topDeviceId;
      if (!deviceId || !c.phoneNumber) continue;

      activeNumbers.push(c.phoneNumber);
      const cleanNum = c.phoneNumber.replace(/[^0-9]/g, '');
      const isBlocked = c.isBlocked || (cleanNum.length >= 10 && blockedNumbersSet.has(cleanNum.slice(-10)));
      const isOutgoingBlocked = c.isOutgoingBlocked || (cleanNum.length >= 10 && blockedOutgoingNumbersSet.has(cleanNum.slice(-10)));

      const docData: any = {
        deviceId,
        name: c.name || 'Unknown Contact',
        phoneNumber: c.phoneNumber,
        additionalPhoneNumbers: Array.isArray(c.additionalPhoneNumbers) ? c.additionalPhoneNumbers : [],
        emails: Array.isArray(c.emails) ? c.emails : (c.email ? [c.email] : []),
        accountType: c.accountType || 'Device',
        photoUri: c.photoUri || '',
        firstName: c.firstName || '',
        middleName: c.middleName || '',
        lastName: c.lastName || '',
        nickname: c.nickname || '',
        company: c.company || '',
        jobTitle: c.jobTitle || '',
        department: c.department || '',
        notes: c.notes || '',
        contactSource: c.contactSource || c.accountType || 'Device',
        phoneLabel: c.phoneLabel || 'Mobile',
        isPrimaryNumber: c.isPrimaryNumber !== undefined ? c.isPrimaryNumber : true,
        isBlocked,
        isOutgoingBlocked,
        contactCreatedDate: c.contactCreatedDate ? new Date(c.contactCreatedDate) : undefined,
        contactUpdatedDate: c.contactUpdatedDate ? new Date(c.contactUpdatedDate) : undefined,
        timestamp: c.timestamp ? new Date(c.timestamp) : new Date(),
      };

      operations.push({
        updateOne: {
          filter: { deviceId, phoneNumber: c.phoneNumber },
          update: { $set: docData },
          upsert: true,
        }
      });
    }

    if (operations.length > 0) {
      await Contact.bulkWrite(operations, { ordered: false });
    }

    // Reconcile contacts: delete contacts on backend that no longer exist on child device
    if (isFullSync && activeNumbers.length > 0) {
      await Contact.deleteMany({
        deviceId: targetDeviceId,
        phoneNumber: { $nin: activeNumbers }
      });
    }

    return res.json({ success: true, count: operations.length, reconciled: isFullSync });
  } catch (error: any) {
    console.error('[INGEST-CONTACTS] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
