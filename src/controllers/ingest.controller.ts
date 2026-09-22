import mongoose from 'mongoose';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { CallRecording } from '../models/CallRecording';
import { MediaCapture } from '../models/MediaCapture';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { Contact } from '../models/Contact';
import { SocialMessage } from '../models/SocialMessage';
import { Device } from '../models/Device';
import { uploadMediaToR2 } from '../services/r2.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { isIgnoredSystemPackage } from './parent.controller';

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
        blockedPhoneNumbers: device.blockedPhoneNumbers || [],
        blockedOutgoingPhoneNumbers: device.blockedOutgoingPhoneNumbers || [],
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
    const {
      deviceId,
      contacts,
      callLogs,
      socialMessages,
      appUsage,
      usageRecords,
      appSessions,
      replaceDate,
      isSyncingPastUsage,
      pastUsageSynced,
    } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    // 1. Update 30-day sync status if provided
    if (isSyncingPastUsage !== undefined || pastUsageSynced !== undefined) {
      const updateData: any = { lastUsageSyncTime: new Date() };
      if (isSyncingPastUsage !== undefined) updateData.isSyncingPastUsage = Boolean(isSyncingPastUsage);
      if (pastUsageSynced !== undefined) updateData.pastUsageSynced = Boolean(pastUsageSynced);
      await Device.findOneAndUpdate({ deviceId }, { $set: updateData });
    }

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
        isVideo: cl.isVideo === true || cl.isVideo === 'true',
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

    if (replaceDate && typeof replaceDate === 'string') {
      await AppUsage.deleteMany({ deviceId, date: replaceDate });
    }

    const appUsageList = Array.isArray(appUsage) ? appUsage : (Array.isArray(usageRecords) ? usageRecords : []);
    if (appUsageList.length > 0) {
      // Deduplicate in memory by (packageName + date) taking the maximum duration
      const deduplicatedMap = new Map<string, any>();
      for (const au of appUsageList) {
        if (!au || !au.packageName) continue;
        const packageName = String(au.packageName).trim();
        if (isIgnoredSystemPackage(packageName)) continue;
        const date = au.date || new Date().toISOString().split('T')[0];
        const key = `${packageName}___${date}`;
        const duration = Number(au.usageDurationSeconds) || 0;
        const existing = deduplicatedMap.get(key);
        if (!existing || duration >= (Number(existing.usageDurationSeconds) || 0)) {
          deduplicatedMap.set(key, au);
        }
      }

      const bulkOps = Array.from(deduplicatedMap.values()).map((au: any) => {
        const date = au.date || new Date().toISOString().split('T')[0];
        const packageName = String(au.packageName).trim();
        const appName = au.appName ? String(au.appName).trim() : packageName;
        const appIcon = au.appIcon ? String(au.appIcon) : undefined;
        const usageDurationSeconds = Number(au.usageDurationSeconds) || 0;
        const category = au.category ? String(au.category) : undefined;
        const timestamp = au.timestamp ? new Date(au.timestamp) : new Date();

        return {
          updateOne: {
            filter: { deviceId, packageName, date },
            update: {
              $set: {
                appName,
                ...(appIcon ? { appIcon } : {}),
                usageDurationSeconds,
                category,
                date,
                timestamp,
              },
            },
            upsert: true,
          },
        };
      });

      if (bulkOps.length > 0) {
        await AppUsage.bulkWrite(bulkOps, { ordered: false });
      }
    }

    if (replaceDate && typeof replaceDate === 'string') {
      await AppSession.deleteMany({ deviceId, date: replaceDate });
    }

    if (Array.isArray(appSessions) && appSessions.length > 0) {
      const sessionOps = appSessions
        .filter((s: any) => s && s.packageName && s.startTime && s.endTime && !isIgnoredSystemPackage(String(s.packageName)))
        .map((s: any) => {
          const startTime = new Date(s.startTime);
          const endTime = new Date(s.endTime);
          const durationSeconds = Number(s.durationSeconds) || Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
          const date = (s.date && String(s.date).trim()) ? String(s.date).trim() : startTime.toISOString().split('T')[0];
          const packageName = String(s.packageName).trim();
          const appName = s.appName ? String(s.appName).trim() : packageName;

          return {
            updateOne: {
              filter: { deviceId, packageName, startTime },
              update: {
                $set: {
                  appName,
                  endTime,
                  durationSeconds,
                  date,
                },
              },
              upsert: true,
            },
          };
        });

      if (sessionOps.length > 0) {
        await AppSession.bulkWrite(sessionOps, { ordered: false });
      }
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

      const isVideo = item.isVideo === true || item.isVideo === 'true';

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
        isVideo: !!isVideo,
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

/**
 * Ingest Call Recording from Child App
 */
export const ingestCallRecording = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      phoneNumber,
      contactName,
      callType,
      durationSeconds,
      audioBase64,
      audioData,
      timestamp,
      fileSizeBytes,
    } = req.body;

    if (!deviceId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'deviceId and phoneNumber are required' });
    }

    const base64Data = audioBase64 || audioData;
    if (!base64Data) {
      return res.status(400).json({ success: false, message: 'audio data is required' });
    }

    const cleanBase64 = base64Data.replace(/^data:audio\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const folderName = `recordings/${deviceId}`;
    const audioUrl = await uploadMediaToR2(buffer, folderName, 'm4a', 'audio/mp4');

    let resolvedContactName = contactName || '';
    if (!resolvedContactName) {
      const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
      const contact = await Contact.findOne({
        deviceId,
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 10 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) + '$' } }] : [])
        ]
      });
      if (contact) {
        resolvedContactName = contact.name;
      }
    }

    const callRecording = new CallRecording({
      deviceId,
      phoneNumber,
      contactName: resolvedContactName,
      callType: callType === 'outgoing' ? 'outgoing' : 'incoming',
      durationSeconds: Number(durationSeconds) || 0,
      audioUrl,
      fileSizeBytes: fileSizeBytes || buffer.length,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await callRecording.save();

    console.log(`[CALL-RECORDING] Uploaded call recording for device ${deviceId}, phone ${phoneNumber}: ${audioUrl}`);

    return res.json({
      success: true,
      message: 'Call recording ingested successfully',
      recordingId: callRecording._id,
      audioUrl,
    });
  } catch (error: any) {
    console.error('[INGEST-CALL-RECORDING] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Direct Streaming Ingest for Large Audio Recordings (e.g. 10 hours)
 * Streams directly from the network socket into disk, using <64KB of RAM.
 */
export const ingestCallRecordingStream = async (req: Request, res: Response) => {
  try {
    const deviceId = req.headers['x-device-id'] as string;
    const rawPhone = (req.headers['x-phone-number'] as string) || '';

    if (!deviceId || !rawPhone) {
      return res.status(400).json({ success: false, message: 'x-device-id and x-phone-number headers required' });
    }

    let phoneNumber = rawPhone;
    try {
      phoneNumber = decodeURIComponent(rawPhone).trim();
    } catch (_) {
      phoneNumber = rawPhone.replace(/%2B/gi, '+').trim();
    }

    const rawContact = (req.headers['x-contact-name'] as string) || '';
    let contactName = '';
    if (rawContact) {
      try {
        contactName = decodeURIComponent(rawContact.replace(/\+/g, ' ')).trim();
      } catch (_) {
        contactName = rawContact.replace(/\+/g, ' ').trim();
      }
    }

    const callType = (req.headers['x-call-type'] as string) === 'outgoing' ? 'outgoing' : 'incoming';
    const durationSeconds = parseInt((req.headers['x-duration-seconds'] as string) || '0', 10);
    const timestampMs = parseInt((req.headers['x-timestamp'] as string) || `${Date.now()}`, 10);

    const targetDir = path.join(__dirname, '../../public/uploads/recordings', deviceId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = `${uuidv4()}.m4a`;
    const filePath = path.join(targetDir, filename);

    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
      try {
        const fileSizeBytes = fs.statSync(filePath).size;
        const audioUrl = `/uploads/recordings/${deviceId}/${filename}`;

        let resolvedContactName = contactName || '';
        if (!resolvedContactName) {
          const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
          const contact = await Contact.findOne({
            deviceId,
            $or: [
              { phoneNumber },
              ...(cleanNum.length >= 10 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) + '$' } }] : [])
            ]
          });
          if (contact) resolvedContactName = contact.name;
        }

        const callRecording = new CallRecording({
          deviceId,
          phoneNumber,
          contactName: resolvedContactName,
          callType,
          durationSeconds,
          audioUrl,
          fileSizeBytes,
          timestamp: new Date(timestampMs),
        });
        await callRecording.save();

        console.log(`[CALL-RECORDING-STREAM] Streamed call recording for ${deviceId}, phone ${phoneNumber}, size: ${fileSizeBytes} bytes`);
        return res.json({
          success: true,
          message: 'Call recording streamed successfully',
          audioUrl,
          recordingId: callRecording._id,
        });
      } catch (err: any) {
        console.error('[CALL-RECORDING-STREAM] Error saving record:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    });

    writeStream.on('error', (err) => {
      console.error('[CALL-RECORDING-STREAM] Write error:', err);
      return res.status(500).json({ success: false, message: err.message });
    });
  } catch (error: any) {
    console.error('[CALL-RECORDING-STREAM] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Dedicated Ingestion endpoint for App Sessions
 */
export const ingestAppSessions = async (req: Request, res: Response) => {
  try {
    const { deviceId, appSessions, replaceDate } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    if (replaceDate) {
      await AppSession.deleteMany({ deviceId, date: replaceDate });
    }

    if (Array.isArray(appSessions) && appSessions.length > 0) {
      const sessionOps = appSessions
        .filter((s: any) => s && s.packageName && s.startTime && s.endTime && !isIgnoredSystemPackage(String(s.packageName)))
        .map((s: any) => {
          const startTime = new Date(s.startTime);
          const endTime = new Date(s.endTime);
          const durationSeconds = Number(s.durationSeconds) || Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
          const date = (s.date && String(s.date).trim()) ? String(s.date).trim() : startTime.toISOString().split('T')[0];
          const packageName = String(s.packageName).trim();
          const appName = s.appName ? String(s.appName).trim() : packageName;

          return {
            updateOne: {
              filter: { deviceId, packageName, startTime },
              update: {
                $set: {
                  appName,
                  endTime,
                  durationSeconds,
                  date,
                  sessionType: s.sessionType || 'normal',
                },
              },
              upsert: true,
            },
          };
        });

      if (sessionOps.length > 0) {
        await AppSession.bulkWrite(sessionOps, { ordered: false });
      }
    }

    return res.json({ success: true, message: 'App sessions ingested successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update 30-Day Historical Sync Status from Child Device
 */
export const updateDeviceSyncStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId, isSyncingPastUsage, pastUsageSynced } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const updateData: any = { lastUsageSyncTime: new Date() };
    if (isSyncingPastUsage !== undefined) updateData.isSyncingPastUsage = Boolean(isSyncingPastUsage);
    if (pastUsageSynced !== undefined) updateData.pastUsageSynced = Boolean(pastUsageSynced);

    const device = await Device.findOneAndUpdate({ deviceId }, { $set: updateData }, { new: true });
    return res.json({ success: true, device });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ingest List of All Installed User-Facing Apps on Child Device
 */
export const ingestInstalledApps = async (req: Request, res: Response) => {
  try {
    const { deviceId, installedApps } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    if (Array.isArray(installedApps)) {
      const cleanApps = installedApps
        .filter((a: any) => a && a.packageName)
        .map((a: any) => ({
          packageName: String(a.packageName).trim(),
          appName: a.appName ? String(a.appName).trim() : String(a.packageName).trim(),
          appIcon: a.appIcon ? String(a.appIcon) : undefined,
          versionName: a.versionName ? String(a.versionName) : undefined,
          versionCode: a.versionCode ? Number(a.versionCode) : undefined,
          firstInstallTime: a.firstInstallTime ? Number(a.firstInstallTime) : undefined,
          lastUpdateTime: a.lastUpdateTime ? Number(a.lastUpdateTime) : undefined,
          permissions: Array.isArray(a.permissions) ? a.permissions.map(String) : [],
        }));

      await Device.findOneAndUpdate(
        { deviceId },
        { $set: { installedApps: cleanApps } }
      );
    }

    return res.json({ success: true, message: 'Installed apps updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


