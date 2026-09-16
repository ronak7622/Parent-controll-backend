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

    const docs = rawLogs.map((item: any) => ({
      deviceId: item.deviceId || topDeviceId,
      url: item.url,
      domain: item.domain || item.url,
      title: item.title,
      browserPackage: item.browserPackage || 'browser',
      browserName: item.browserName || 'Browser',
      blocked: item.blocked || false,
      blockReason: item.blockReason,
      timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
    })).filter((d: any) => d.deviceId && d.url);

    if (docs.length > 0) {
      await BrowserHistory.insertMany(docs);
    }

    return res.json({ success: true, count: docs.length });
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
      await YouTubeHistory.insertMany(docs);
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
