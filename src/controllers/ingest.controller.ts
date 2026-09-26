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
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { Device } from '../models/Device';
import { uploadMediaToR2 } from '../services/r2.service';
import { sendFcmTopicNotification } from '../services/fcm.service';
import { isIgnoredSystemPackage, getISTDateString } from './parent.controller';

// "1h 5m" / "45m" / "30s"
const formatDurationShortIngest = (totalSeconds: number): string => {
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
};

export const getLocalDateString = getISTDateString;

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
      // Real push via FCM (works even if the parent app is backgrounded/killed), one per device
      // so a batch of several blocked URLs on the same device only sends the most recent one.
      const byDevice = new Map<string, any>();
      for (const bd of blockedDocs) byDevice.set(bd.deviceId, bd);
      for (const [deviceId, bd] of byDevice) {
        sendBlockedUrlPush(deviceId, bd).catch((err) => console.warn('[FCM] blocked-url push error:', err?.message));
      }
    }

    return res.json({ success: true, count: insertedOrUpdated.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

async function sendBlockedUrlPush(deviceId: string, doc: any) {
  const device = await Device.findOne({ deviceId });
  if (!device?.parentUserId) return;
  if (device.notifyOnBlockedUrlAttempt === false) return;

  const childName = device.deviceName || 'Child Device';
  const target = doc.url || doc.domain || 'a website';
  const reason = doc.blockReason ? String(doc.blockReason) : 'the Blacklist';
  const title = 'Blocked URL Access';
  const body = `${childName} attempted to access "${target}" in ${reason}`;

  await sendFcmTopicNotification(`parent_${device.parentUserId}`, title, body, {
    type: 'BLOCKED_URL_ACCESS',
    deviceId,
    url: target,
  });
}

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
        const byDevice = new Map<string, any>();
        for (const bd of blockedDocs) byDevice.set(bd.deviceId, bd);
        for (const [deviceId, bd] of byDevice) {
          sendYoutubeBlockedPush(deviceId, 'keyword', !!bd.isShorts, bd.blockReason).catch((err) =>
            console.warn('[FCM] blocked-youtube push error:', err?.message)
          );
        }
      }
    }

    if (topDeviceId) await Device.findOneAndUpdate({ deviceId: topDeviceId }, { $set: { lastYoutubeSyncTime: new Date() } });
    return res.json({ success: true, count: docs.length });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * - 'app': the YouTube app block is an App Management rule; its alert is sent by
 *   reportBlockedAppAttempt, which honours that rule's "notify me" toggle. Sending here too
 *   ignored the toggle (and duplicated the alert), so nothing is sent from here.
 * - 'shorts': only when the Shorts block's "Show notification while attempt" toggle is ON.
 * - 'keyword': keyword-restricted videos have no separate toggle, always notify.
 */
async function sendYoutubeBlockedPush(
  deviceId: string,
  kind: 'app' | 'shorts' | 'keyword',
  isShorts: boolean,
  blockReason?: string
) {
  if (kind === 'app') return;
  const device = await Device.findOne({ deviceId });
  if (!device?.parentUserId) return;

  if (kind === 'shorts') {
    const schedule: any = device.youtubeShortsBlockSchedule;
    if (schedule?.notifyOnAttempt !== true) return;
  }

  const childName = device.deviceName || 'Child Device';
  const title = isShorts ? 'Blocked Shorts Access' : 'Blocked YouTube Access';
  const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const body = isShorts
    ? `${childName} attempted to access YouTube Shorts at ${timeStr} while blocked`
    : `${childName} attempted to open YouTube App at ${timeStr} while blocked`;

  await sendFcmTopicNotification(`parent_${device.parentUserId}`, title, body, {
    type: isShorts ? 'YOUTUBE_SHORTS_BLOCKED' : 'YOUTUBE_APP_BLOCKED',
    deviceId,
    reason: blockReason || '',
  });
}

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
      const dateStr = (item.date && String(item.date).trim()) ? String(item.date).trim() : getLocalDateString(item.startTime || start);
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

      const blockedDocs = docs.filter((d: any) => d.blocked);
      if (blockedDocs.length > 0) {
        const byDevice = new Map<string, any>();
        for (const bd of blockedDocs) byDevice.set(bd.deviceId, bd);
        for (const [deviceId, bd] of byDevice) {
          const isShorts = !!(bd.blockReason && String(bd.blockReason).toLowerCase().includes('short'));
          sendYoutubeBlockedPush(deviceId, isShorts ? 'shorts' : 'app', isShorts, bd.blockReason).catch((err) =>
            console.warn('[FCM] blocked-youtube-session push error:', err?.message)
          );
        }
      }
    }

    if (topDeviceId) await Device.findOneAndUpdate({ deviceId: topDeviceId }, { $set: { lastYoutubeSyncTime: new Date() } });
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

    // 1. Always update lastUsageSyncTime & 30-day sync status on Device
    const updateData: any = { lastUsageSyncTime: new Date() };
    if (isSyncingPastUsage !== undefined) updateData.isSyncingPastUsage = Boolean(isSyncingPastUsage);
    if (pastUsageSynced !== undefined) updateData.pastUsageSynced = Boolean(pastUsageSynced);
    await Device.findOneAndUpdate({ deviceId }, { $set: updateData });

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

    const appUsageList = Array.isArray(appUsage) ? appUsage : (Array.isArray(usageRecords) ? usageRecords : []);
    if (appUsageList.length > 0) {
      // Deduplicate in memory by (packageName + date) taking the maximum duration
      const deduplicatedMap = new Map<string, any>();
      for (const au of appUsageList) {
        if (!au || !au.packageName) continue;
        const packageName = String(au.packageName).trim();
        if (isIgnoredSystemPackage(packageName)) continue;
        const date = (au.date && String(au.date).trim()) ? String(au.date).trim() : getLocalDateString(au.timestamp);
        const key = `${packageName}___${date}`;
        const duration = Number(au.usageDurationSeconds) || 0;
        const existing = deduplicatedMap.get(key);
        if (!existing || duration >= (Number(existing.usageDurationSeconds) || 0)) {
          deduplicatedMap.set(key, au);
        }
      }

      const bulkOps = Array.from(deduplicatedMap.values()).map((au: any) => {
        const date = (au.date && String(au.date).trim()) ? String(au.date).trim() : getLocalDateString(au.timestamp);
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
        console.log(`[INGEST-APP-USAGE] Device: ${deviceId}, Ingested ${bulkOps.length} usage records. ReplaceDate: ${replaceDate || 'none'}`);
        for (const item of Array.from(deduplicatedMap.values())) {
          console.log(`  -> ${item.packageName} | date=${item.date} | duration=${item.usageDurationSeconds}s`);
        }
      }
    }

    if (Array.isArray(appSessions) && appSessions.length > 0) {
      const filteredSessions = appSessions.filter((s: any) => s && s.packageName && s.startTime && s.endTime && !isIgnoredSystemPackage(String(s.packageName)));
      const sessionOps = filteredSessions.map((s: any) => {
          const startTime = new Date(s.startTime);
          const endTime = new Date(s.endTime);
          const durationSeconds = Number(s.durationSeconds) || Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
          const date = (s.date && String(s.date).trim()) ? String(s.date).trim() : getLocalDateString(s.startTime);
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
        console.log(`[INGEST-APP-SESSIONS] Device: ${deviceId}, Ingested ${sessionOps.length} sessions. ReplaceDate: ${replaceDate || 'none'}`);
        for (const s of filteredSessions) {
          console.log(`  -> ${s.packageName} | ${s.startTime} -> ${s.endTime} (${s.durationSeconds}s) | date=${s.date}`);
        }
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
/**
 * Dedicated Ingestion endpoint for the Notification Center. The child batches notifications
 * locally (hourly, on manual "Sync Now", or on reconnect) instead of sending one request per
 * notification, so a chatty/repeating notification never causes a request storm.
 */
export const ingestNotifications = async (req: Request, res: Response) => {
  try {
    const { deviceId, notifications } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    // Marks that a sync actually happened, for the parent's "Last Synced" label - even calls with
    // nothing new still confirm the child is reachable and up to date.
    await Device.findOneAndUpdate({ deviceId }, { $set: { lastNotificationSyncTime: new Date() } });

    if (!Array.isArray(notifications) || notifications.length === 0) {
      return res.json({ success: true, message: 'No notifications to ingest.' });
    }

    const asStringArray = (v: any, max: number): string[] | undefined => {
      if (!Array.isArray(v) || v.length === 0) return undefined;
      return v.filter((x) => x != null).map((x) => String(x).slice(0, 500)).slice(0, max);
    };

    const ops = notifications
      .filter((n: any) => n && n.packageName && n.timestamp)
      .slice(0, 500)
      .map((n: any) => {
        const timestamp = new Date(n.timestamp);
        const packageName = String(n.packageName).trim();
        const appName = n.appName ? String(n.appName).trim() : packageName;
        const title = n.title ? String(n.title).slice(0, 500) : '';
        const body = n.body ? String(n.body).slice(0, 2000) : '';
        const date = (n.date && String(n.date).trim()) || getLocalDateString(n.timestamp);

        return {
          updateOne: {
            filter: { deviceId, packageName, timestamp, title, body },
            update: {
              $setOnInsert: {
                deviceId,
                packageName,
                appName,
                timestamp,
                date,
                title,
                body,
                isRead: false,
                subText: n.subText ? String(n.subText).slice(0, 500) : undefined,
                bigText: n.bigText ? String(n.bigText).slice(0, 4000) : undefined,
                summaryText: n.summaryText ? String(n.summaryText).slice(0, 500) : undefined,
                infoText: n.infoText ? String(n.infoText).slice(0, 500) : undefined,
                category: n.category ? String(n.category).slice(0, 100) : undefined,
                number: typeof n.number === 'number' && n.number > 0 ? n.number : undefined,
                messages: asStringArray(n.messages, 50),
                actionLabels: asStringArray(n.actionLabels, 10),
              },
              // A chat app often re-posts the same message a moment later with its photo attached,
              // so the image is $set (not insert-only) to fill it in on the already-saved row.
              ...(n.imageBase64 ? { $set: { imageBase64: String(n.imageBase64) } } : {}),
            },
            upsert: true,
          },
        };
      });

    if (ops.length > 0) {
      await ChildNotification.bulkWrite(ops, { ordered: false });
    }

    return res.json({ success: true, message: `Ingested ${ops.length} notifications.` });
  } catch (error: any) {
    console.error('[NOTIFICATIONS] Ingest error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const ingestAppSessions = async (req: Request, res: Response) => {
  try {
    const { deviceId, appSessions, replaceDate } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    if (Array.isArray(appSessions) && appSessions.length > 0) {
      const sessionOps = appSessions
        .filter((s: any) => s && s.packageName && s.startTime && s.endTime && !isIgnoredSystemPackage(String(s.packageName)))
        .map((s: any) => {
          const startTime = new Date(s.startTime);
          const endTime = new Date(s.endTime);
          const durationSeconds = Number(s.durationSeconds) || Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
          const date = (s.date && String(s.date).trim()) ? String(s.date).trim() : getLocalDateString(s.startTime);
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
        await Device.findOneAndUpdate({ deviceId }, { $set: { lastUsageSyncTime: new Date() } });
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
          grantedPermissions: Array.isArray(a.grantedPermissions) ? a.grantedPermissions.map(String) : [],
          isSystemApp: typeof a.isSystemApp === 'boolean' ? a.isSystemApp : undefined,
          category: a.category ? String(a.category) : undefined,
          targetSdkVersion: a.targetSdkVersion ? Number(a.targetSdkVersion) : undefined,
          minSdkVersion: a.minSdkVersion ? Number(a.minSdkVersion) : undefined,
          installerPackage: a.installerPackage ? String(a.installerPackage) : undefined,
          apkSizeBytes: a.apkSizeBytes ? Number(a.apkSizeBytes) : undefined,
          apkDownloadSizeBytes: a.apkDownloadSizeBytes ? Number(a.apkDownloadSizeBytes) : undefined,
          isEnabled: typeof a.isEnabled === 'boolean' ? a.isEnabled : undefined,
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

/**
 * Batch Ingest Location History from Child App (5-minute periodic queue or hourly sync)
 */
export const ingestLocationHistory = async (req: Request, res: Response) => {
  try {
    const rawItems = req.body.locations || req.body.logs || req.body.data || (Array.isArray(req.body) ? req.body : [req.body]);
    const topDeviceId = req.body.deviceId;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty location payload' });
    }

    const docsToInsert: any[] = [];
    let latestLoc: any = null;

    for (const item of rawItems) {
      const deviceId = item.deviceId || topDeviceId;
      if (!deviceId || typeof item.latitude !== 'number' || typeof item.longitude !== 'number') continue;

      const ts = item.timestamp ? new Date(item.timestamp) : new Date();
      const dateStr = (item.date && String(item.date).trim()) ? String(item.date).trim() : getLocalDateString(ts);
      const speed = typeof item.speed === 'number' ? Math.max(0, item.speed) : 0;

      const doc = {
        deviceId,
        latitude: item.latitude,
        longitude: item.longitude,
        altitude: item.altitude || 0,
        speed,
        heading: item.heading || item.bearing || 0,
        accuracy: item.accuracy || 0,
        locationName: item.locationName || item.address || '',
        locationAddress: item.locationAddress || item.locationName || item.address || '',
        activityType: item.activityType || (speed > 5 ? 'IN_VEHICLE' : (speed > 1.5 ? 'WALKING' : 'STILL')),
        isMoving: typeof item.isMoving === 'boolean' ? item.isMoving : speed > 1.5,
        isLive: !!item.isLive,
        date: dateStr,
        timestamp: ts,
      };

      docsToInsert.push(doc);

      if (!latestLoc || ts.getTime() > latestLoc.updatedAt.getTime()) {
        latestLoc = {
          latitude: item.latitude,
          longitude: item.longitude,
          altitude: item.altitude || 0,
          speed,
          heading: item.heading || item.bearing || 0,
          accuracy: item.accuracy || 0,
          address: doc.locationAddress,
          activityType: doc.activityType,
          isMoving: doc.isMoving,
          batteryLevel: item.batteryLevel,
          updatedAt: ts,
        };
      }
    }

    if (docsToInsert.length > 0) {
      const ops = docsToInsert.map((doc) => ({
        updateOne: {
          filter: { deviceId: doc.deviceId, timestamp: doc.timestamp },
          update: { $set: doc },
          upsert: true,
        },
      }));
      await LocationLog.bulkWrite(ops, { ordered: false });
    }

    const targetDeviceId = topDeviceId || (docsToInsert[0]?.deviceId);
    if (targetDeviceId && latestLoc) {
      await Device.findOneAndUpdate(
        { deviceId: targetDeviceId },
        {
          $set: {
            lastLocationSyncTime: new Date(),
            lastLocation: latestLoc,
          },
        }
      );
    }

    return res.json({ success: true, count: docsToInsert.length });
  } catch (error: any) {
    console.error('[INGEST-LOCATION-HISTORY] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ingest Real-Time Live Location Point from Child Device (High precision stream during live view)
 */
export const ingestLiveLocation = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      latitude,
      longitude,
      altitude,
      speed,
      heading,
      accuracy,
      locationName,
      locationAddress,
      activityType,
      isMoving,
      batteryLevel,
      timestamp,
    } = req.body;

    if (!deviceId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ success: false, message: 'deviceId, latitude, and longitude are required' });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();
    const dateStr = getLocalDateString(ts);
    const speedVal = typeof speed === 'number' ? Math.max(0, speed) : 0;
    const addressStr = locationAddress || locationName || '';
    const resolvedActivity = activityType || (speedVal > 5 ? 'IN_VEHICLE' : (speedVal > 1.5 ? 'WALKING' : 'STILL'));

    const doc = new LocationLog({
      deviceId,
      latitude,
      longitude,
      altitude: altitude || 0,
      speed: speedVal,
      heading: heading || 0,
      accuracy: accuracy || 0,
      locationName: addressStr,
      locationAddress: addressStr,
      activityType: resolvedActivity,
      isMoving: typeof isMoving === 'boolean' ? isMoving : speedVal > 1.5,
      isLive: true,
      date: dateStr,
      timestamp: ts,
    });

    await doc.save();

    const lastLocObj = {
      latitude,
      longitude,
      altitude: altitude || 0,
      speed: speedVal,
      heading: heading || 0,
      accuracy: accuracy || 0,
      address: addressStr,
      activityType: resolvedActivity,
      isMoving: typeof isMoving === 'boolean' ? isMoving : speedVal > 1.5,
      batteryLevel: batteryLevel || 100,
      updatedAt: ts,
    };

    await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          lastLocationSyncTime: new Date(),
          lastLocation: lastLocObj,
        },
      }
    );

    return res.json({ success: true, location: doc, lastLocation: lastLocObj });
  } catch (error: any) {
    console.error('[INGEST-LIVE-LOCATION] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};



