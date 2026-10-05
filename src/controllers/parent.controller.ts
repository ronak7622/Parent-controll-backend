import mongoose from 'mongoose';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/auth';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { CallRecording } from '../models/CallRecording';
import { MediaCapture } from '../models/MediaCapture';
import { ScheduleConfig } from '../models/ScheduleConfig';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';
import { Contact } from '../models/Contact';
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { KeyboardLog } from '../models/KeyboardLog';
import { Device } from '../models/Device';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { sendFcmDataCommand } from '../services/fcm.service';
import { getReadQuery, buildShardFilter, clampPaginationLimit } from '../dal/db.dal';
import { cacheService } from '../services/cache.service';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30

export function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

export function getISTDateString(val?: any): string {
  if (typeof val === 'string' && val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.substring(0, 10);
  }
  const dateObj = val ? new Date(val) : new Date();
  if (!isNaN(dateObj.getTime())) {
    return toIST(dateObj).toISOString().split('T')[0];
  }
  return toIST(new Date()).toISOString().split('T')[0];
}

/**
 * Fetch Browser History with date filter (90+ days calendar support)
 */
export const getBrowserHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit = 500 } = req.query;

    const query: any = { deviceId };
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const fetchLimit = clampPaginationLimit(limit, 500, 100);
    const items = await getReadQuery(BrowserHistory)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(fetchLimit);

    let totalBrowsingDurationSeconds = 0;
    let morningSeconds = 0;
    let morningCount = 0;
    let afternoonSeconds = 0;
    let afternoonCount = 0;
    let nightSeconds = 0;
    let nightCount = 0;
    const hourlyDurations = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);

    const formattedItems = items.map((doc) => {
      const obj = doc.toObject();
      if (!obj.startTime) {
        obj.startTime = obj.timestamp;
      }

      const dur = obj.durationSeconds || 0;
      totalBrowsingDurationSeconds += dur;

      const eventTime = new Date(obj.startTime);
      const hour = eventTime.getHours();
      if (hour >= 0 && hour < 24) {
        hourlyDurations[hour] += dur;
        hourlyCounts[hour] += 1;
      }

      if (hour >= 6 && hour < 12) {
        morningSeconds += dur;
        morningCount++;
      } else if (hour >= 12 && hour < 18) {
        afternoonSeconds += dur;
        afternoonCount++;
      } else {
        nightSeconds += dur;
        nightCount++;
      }

      return obj;
    });

    let peakHour = -1;
    let maxHourDur = -1;
    let maxHourCount = -1;
    for (let h = 0; h < 24; h++) {
      if (hourlyDurations[h] > maxHourDur || (hourlyDurations[h] === maxHourDur && hourlyCounts[h] > maxHourCount)) {
        if (hourlyDurations[h] > 0 || hourlyCounts[h] > 0) {
          maxHourDur = hourlyDurations[h];
          maxHourCount = hourlyCounts[h];
          peakHour = h;
        }
      }
    }

    let peakPeriod = '';
    if (morningSeconds > 0 || afternoonSeconds > 0 || nightSeconds > 0) {
      if (morningSeconds >= afternoonSeconds && morningSeconds >= nightSeconds) {
        peakPeriod = 'Morning';
      } else if (afternoonSeconds >= morningSeconds && afternoonSeconds >= nightSeconds) {
        peakPeriod = 'Afternoon';
      } else {
        peakPeriod = 'Night';
      }
    } else if (morningCount > 0 || afternoonCount > 0 || nightCount > 0) {
      if (morningCount >= afternoonCount && morningCount >= nightCount) {
        peakPeriod = 'Morning';
      } else if (afternoonCount >= morningCount && afternoonCount >= nightCount) {
        peakPeriod = 'Afternoon';
      } else {
        peakPeriod = 'Night';
      }
    }

    return res.json({
      success: true,
      items: formattedItems,
      events: formattedItems,
      totalBrowsingDurationSeconds,
      timeOfDayBreakup: {
        morningSeconds,
        morningCount,
        afternoonSeconds,
        afternoonCount,
        nightSeconds,
        nightCount,
      },
      peakUsage: {
        peakPeriod,
        peakHour,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single Browser History item by ID
 */
export const deleteBrowserHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await BrowserHistory.deleteMany({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: 'Browser history record deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a batch of Browser History items by IDs
 */
export const deleteBrowserHistoryBatch = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      await BrowserHistory.deleteMany({ $or: [{ _id: { $in: ids } }, { id: { $in: ids } }] });
    }
    return res.json({ success: true, message: 'Batch browser history records deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Browser History records for a device (optionally filtered by date)
 */
export const deleteBrowserHistoryForDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;
    const query: any = { deviceId };
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const result = await BrowserHistory.deleteMany(query);

    if (date) {
      await Device.updateMany({ deviceId }, { $addToSet: { clearedBrowserDates: date as string } });
    } else {
      await Device.updateMany({ deviceId }, { $set: { lastBrowserClearedAt: new Date(), clearedBrowserDates: [] } });
    }

    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch YouTube History with date filter (90+ days calendar support)
 */
export const getYouTubeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit = 500 } = req.query;

    const query: any = { deviceId };
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const fetchLimit = clampPaginationLimit(limit, 500, 100);
    const items = await YouTubeHistory.find(query)
      .sort({ timestamp: -1 })
      .limit(fetchLimit);

    const dev = await Device.findOne({ deviceId }).select('lastYoutubeSyncTime');
    return res.json({ success: true, items, events: items, lastSyncTime: dev?.lastYoutubeSyncTime });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch YouTube App Open/Close Sessions with date filter
 */
export const getYouTubeSessions = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit = 500 } = req.query;

    const query: any = { deviceId };
    if (date) {
      query.date = date as string;
    }

    const sessionLimit = clampPaginationLimit(limit, 500, 100);
    const sessions = await YouTubeSession.find(query)
      .sort({ startTime: -1 })
      .limit(sessionLimit);

    const dev = await Device.findOne({ deviceId }).select('lastYoutubeSyncTime');
    return res.json({ success: true, sessions, items: sessions, lastSyncTime: dev?.lastYoutubeSyncTime });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single YouTube session by ID
 */
export const deleteYouTubeSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await YouTubeSession.deleteMany({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: 'Session deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete YouTube sessions for a device (optionally filtered by date)
 */
export const deleteYouTubeSessionsForDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;
    const query: any = { deviceId };
    if (date) query.date = date as string;

    const result = await YouTubeSession.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single YouTube history record by ID
 */
export const deleteYouTubeHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await YouTubeHistory.deleteMany({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: 'History record deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete YouTube history records for a device (optionally filtered by date)
 */
export const deleteYouTubeHistoryForDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;
    const query: any = { deviceId };
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const result = await YouTubeHistory.deleteMany(query);

    if (date) {
      await Device.updateMany({ deviceId }, { $addToSet: { clearedYoutubeDates: date as string } });
    } else {
      await Device.updateMany({ deviceId }, { $set: { lastYoutubeClearedAt: new Date(), clearedYoutubeDates: [] } });
    }

    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Screenshots & Photos Captures with filter (type: screenshot / front_photo / back_photo)
 */
export const getCapturedMedia = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { type, captureType, date, limit = 100 } = req.query;

    const query: any = { deviceId };
    if (type) query.type = type;
    if (captureType) query.captureType = captureType;
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const fetchLimit = clampPaginationLimit(limit, 200, 50);
    const items = await MediaCapture.find(query)
      .sort({ timestamp: -1 })
      .limit(fetchLimit);

    const host = req.get('host') || 'localhost:5000';
    const baseUrl = `${req.protocol}://${host}`;

    const formattedItems = items.map((doc) => {
      const obj = doc.toObject ? doc.toObject() : doc;
      if (obj.mediaUrl && obj.mediaUrl.startsWith('/uploads')) {
        obj.mediaUrl = `${baseUrl}${obj.mediaUrl}`;
      }
      if (obj.thumbnailUrl && obj.thumbnailUrl.startsWith('/uploads')) {
        obj.thumbnailUrl = `${baseUrl}${obj.thumbnailUrl}`;
      }
      if (!obj.thumbnailUrl) {
        obj.thumbnailUrl = obj.mediaUrl;
      }
      return obj;
    });

    return res.json({ success: true, items: formattedItems, captures: formattedItems });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Screenshot Schedule Config for Device
 */
export const getScheduleConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    let config = await ScheduleConfig.findOne({ deviceId });
    if (!config) {
      config = new ScheduleConfig({ deviceId });
    }
    return res.json({ success: true, config });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Save / Update Screenshot Schedule Config for Device
 */
export const updateScheduleConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const updateData = req.body;

    const config = await ScheduleConfig.findOneAndUpdate(
      { deviceId },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await cacheService.del(cacheService.keys.deviceRules(deviceId));

    // Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('update-schedule-config', config);
    }

    return res.json({ success: true, message: 'Schedule configuration updated', config });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Captured Media (Single ID, Selected Date, or All)
 */
export const deleteCapturedMedia = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { id, date, all, deleteAll } = req.query;

    const query: any = { deviceId };

    if (id) {
      query._id = id;
    } else if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    } else if (all !== 'true' && deleteAll !== 'true') {
      return res.status(400).json({ success: false, message: 'Specify id, date, or all=true' });
    }

    const result = await MediaCapture.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Contacts with search and pagination
 */
export const getContacts = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { search, page, limit } = req.query;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const query: any = {
      $or: [
        { deviceId },
        { deviceId: targetDeviceId },
      ],
    };

    if (search) {
      const searchStr = (search as string).trim();
      const regex = new RegExp(searchStr, 'i');
      query.$and = [
        { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
        {
          $or: [
            { name: regex },
            { phoneNumber: regex },
            { emails: regex },
            { additionalPhoneNumbers: regex },
          ],
        },
      ];
      delete query.$or;
    }

    // Support optional pagination while maintaining backward compatibility
    let contactsQuery = Contact.find(query).sort({ name: 1 });
    let total = 0;
    let pageNum = 1;
    let limitNum = 0;

    if (page || limit) {
      pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      limitNum = Math.min(10000, Math.max(1, parseInt(limit as string, 10) || 5000));
      const skip = (pageNum - 1) * limitNum;
      contactsQuery = contactsQuery.skip(skip).limit(limitNum);
      total = await Contact.countDocuments(query);
    }

    const contacts = await contactsQuery;
    if (!total) total = contacts.length;

    const targetDev = await Device.findOne({ deviceId: { $in: [deviceId, targetDeviceId] } });
    const blockedIncomingSet = new Set((targetDev?.blockedPhoneNumbers || []).map((n: string) => {
      const c = n.replace(/[^0-9]/g, '');
      return c.length >= 7 ? c.slice(-10) : c;
    }));
    const blockedOutgoingSet = new Set((targetDev?.blockedOutgoingPhoneNumbers || []).map((n: string) => {
      const c = n.replace(/[^0-9]/g, '');
      return c.length >= 7 ? c.slice(-10) : c;
    }));

    const sanitizedContacts = contacts.map((c: any) => {
      const obj = c.toObject ? c.toObject() : c;
      const clean = (obj.phoneNumber || '').replace(/[^0-9]/g, '');
      const last10 = clean.length >= 7 ? clean.slice(-10) : clean;
      const isIncomingBlocked = (clean.length >= 7 && blockedIncomingSet.has(last10)) || !!obj.isBlocked;
      const isOutgoingBlocked = (clean.length >= 7 && blockedOutgoingSet.has(last10)) || !!obj.isOutgoingBlocked;
      return {
        ...obj,
        isBlocked: isIncomingBlocked,
        isOutgoingBlocked,
      };
    });

    return res.json({
      success: true,
      contacts: sanitizedContacts,
      total,
      page: pageNum,
      totalPages: limitNum > 0 ? Math.ceil(total / limitNum) : 1,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Call Logs with filtering, search, date range, and pagination
 */
export const getCallLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, type, search, phoneNumber, page, limit } = req.query;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const query: any = {
      deviceId: { $in: [deviceId, targetDeviceId] },
    };

    // Date filter (YYYY-MM-DD)
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    // Call Type filter: 'incoming' | 'outgoing' | 'missed' | 'blocked'
    if (type && type !== 'all') {
      if (type === 'blocked') {
        const targetDev = await Device.findOne({ deviceId: { $in: [deviceId, targetDeviceId] } });
        const devBlocked: string[] = targetDev?.blockedPhoneNumbers || [];
        const devBlockedOutgoing: string[] = targetDev?.blockedOutgoingPhoneNumbers || [];
        const contactBlockedDocs = await Contact.find({
          deviceId: { $in: [deviceId, targetDeviceId] },
          $or: [{ isBlocked: true }, { isOutgoingBlocked: true }],
        }).select('phoneNumber');
        const allBlockedNumbers = [...new Set([...devBlocked, ...devBlockedOutgoing, ...contactBlockedDocs.map((c: any) => c.phoneNumber).filter(Boolean)])];
        const last10Patterns = allBlockedNumbers
          .map((n) => n.replace(/[^0-9]/g, '').slice(-10))
          .filter((n) => n.length >= 7);

        query.$or = [
          { isBlocked: true },
          { isOutgoingBlocked: true },
          { callType: 'blocked' },
          ...(allBlockedNumbers.length > 0 ? [{ phoneNumber: { $in: allBlockedNumbers } }] : []),
          ...(last10Patterns.length > 0 ? [{ phoneNumber: { $regex: last10Patterns.join('|') } }] : []),
        ];
      } else {
        query.callType = type;
      }
    }

    // Filter by specific phone number (for contact detail view)
    if (phoneNumber) {
      const cleanTarget = (phoneNumber as string).replace(/[^0-9]/g, '');
      const lastDigits = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
      const flexRegex = lastDigits.split('').join('[^0-9]*');
      query.$or = [
        { phoneNumber: phoneNumber },
        ...(lastDigits.length >= 5 ? [{ phoneNumber: { $regex: flexRegex, $options: 'i' } }] : [])
      ];
    }

    // Search query (matches contact name or phone number)
    if (search) {
      const searchStr = (search as string).trim();
      const searchRegex = new RegExp(searchStr, 'i');
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: [{ contactName: searchRegex }, { phoneNumber: searchRegex }] }
        ];
        delete query.$or;
      } else {
        query.$or = [
          { contactName: searchRegex },
          { phoneNumber: searchRegex }
        ];
      }
    }

    let logsQuery = CallLog.find(query).sort({ timestamp: -1 });
    let total = 0;
    let pageNum = 1;
    let limitNum = 0;

    if (page || limit) {
      pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 100));
      const skip = (pageNum - 1) * limitNum;
      logsQuery = logsQuery.skip(skip).limit(limitNum);
      total = await CallLog.countDocuments(query);
    }

    const [logs, recordings] = await Promise.all([
      logsQuery,
      CallRecording.find({ deviceId: { $in: [deviceId, targetDeviceId] } }).sort({ timestamp: -1 }).limit(100),
    ]);

    if (!total) total = logs.length;

    const targetDev = await Device.findOne({ deviceId: { $in: [deviceId, targetDeviceId] } });
    const blockedPhoneList: string[] = [...(targetDev?.blockedPhoneNumbers || [])];
    const blockedLast10Set = new Set(blockedPhoneList.map((n: string) => n.replace(/[^0-9]/g, '').slice(-10)));

    // Also include contacts marked as blocked in Contact model
    const blockedContactDocs = await Contact.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
      isBlocked: true,
    }).select('phoneNumber');
    for (const bc of blockedContactDocs) {
      if (bc.phoneNumber) {
        blockedPhoneList.push(bc.phoneNumber);
        const c10 = bc.phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        if (c10.length >= 7) blockedLast10Set.add(c10);
      }
    }

    const blockedOutgoingList: string[] = [...(targetDev?.blockedOutgoingPhoneNumbers || [])];
    const blockedOutgoingLast10Set = new Set(blockedOutgoingList.map((n: string) => n.replace(/[^0-9]/g, '').slice(-10)));

    const blockedOutgoingContactDocs = await Contact.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
      isOutgoingBlocked: true,
    }).select('phoneNumber');
    for (const bc of blockedOutgoingContactDocs) {
      if (bc.phoneNumber) {
        blockedOutgoingList.push(bc.phoneNumber);
        const c10 = bc.phoneNumber.replace(/[^0-9]/g, '').slice(-10);
        if (c10.length >= 7) blockedOutgoingLast10Set.add(c10);
      }
    }

    const sanitizedLogs = logs.map((l: any) => {
      const obj = l.toObject ? l.toObject() : l;
      const clean = (obj.phoneNumber || '').replace(/[^0-9]/g, '');
      const last10 = clean.length >= 7 ? clean.slice(-10) : clean;
      const isTrulyBlocked = obj.isBlocked === true ||
        (clean.length >= 7 && blockedLast10Set.has(last10)) ||
        blockedPhoneList.includes(obj.phoneNumber);
      const isOutgoingBlocked = obj.isOutgoingBlocked === true ||
        (clean.length >= 7 && blockedOutgoingLast10Set.has(last10)) ||
        blockedOutgoingList.includes(obj.phoneNumber);

      // Preserve actual call direction (incoming, outgoing, missed) instead of overwriting with 'blocked'
      const resolvedType = (obj.callType === 'blocked') ? 'incoming' : (obj.callType || 'incoming');

      return {
        ...obj,
        isBlocked: isTrulyBlocked,
        isOutgoingBlocked: isOutgoingBlocked,
        callType: resolvedType,
      };
    });

    const host = req.get('host') || 'localhost:5000';
    const baseUrl = `${req.protocol}://${host}`;

    const formattedRecordings = recordings.map((r: any) => {
      const obj = r.toObject ? r.toObject() : r;
      if (obj.audioUrl && obj.audioUrl.startsWith('/uploads')) {
        obj.audioUrl = `${baseUrl}${obj.audioUrl}`;
      }
      return obj;
    });

    return res.json({
      success: true,
      logs: sanitizedLogs,
      recordings: formattedRecordings,
      total,
      page: pageNum,
      totalPages: limitNum > 0 ? Math.ceil(total / limitNum) : 1,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Block a Phone Number for a Device
 */
export const blockPhoneNumber = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    const last10 = cleanNum.length >= 10 ? cleanNum.slice(-10) : cleanNum;

    // 1. Add to Device.blockedPhoneNumbers
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $addToSet: { blockedPhoneNumbers: phoneNumber } },
      { new: true }
    );

    // 2. Update Contact if exists
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ]
      },
      { $set: { isBlocked: true } }
    );

    // 3. Update all CallLog entries for this number to isBlocked: true
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ],
      },
      { $set: { isBlocked: true } }
    );

    // 4. Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('update-blocked-numbers', {
        blockedPhoneNumbers: device?.blockedPhoneNumbers || [phoneNumber],
      });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('update-blocked-numbers', {
          blockedPhoneNumbers: device?.blockedPhoneNumbers || [phoneNumber],
        });
      }
    }

    return res.json({
      success: true,
      message: `Phone number ${phoneNumber} blocked successfully`,
      blockedPhoneNumbers: device?.blockedPhoneNumbers || [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Unblock a Phone Number for a Device
 */
export const unblockPhoneNumber = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    const last10 = cleanNum.length >= 10 ? cleanNum.slice(-10) : cleanNum;

    // 1. Remove all variations of this number from Device.blockedPhoneNumbers
    const currentDev = await Device.findOne({ $or: [{ deviceId }, { deviceId: targetDeviceId }] });
    const updatedBlocked = (currentDev?.blockedPhoneNumbers || []).filter((n: string) => {
      const c = n.replace(/[^0-9]/g, '');
      const cLast10 = c.length >= 10 ? c.slice(-10) : c;
      return cLast10 !== last10 && n !== phoneNumber;
    });

    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $set: { blockedPhoneNumbers: updatedBlocked } },
      { new: true }
    );

    // 2. Update Contact
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ]
      },
      { $set: { isBlocked: false } }
    );

    // 3. Update CallLog entries to isBlocked: false
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ],
      },
      { $set: { isBlocked: false } }
    );

    // 4. Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('update-blocked-numbers', {
        blockedPhoneNumbers: device?.blockedPhoneNumbers || [],
      });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('update-blocked-numbers', {
          blockedPhoneNumbers: device?.blockedPhoneNumbers || [],
        });
      }
    }

    return res.json({
      success: true,
      message: `Phone number ${phoneNumber} unblocked successfully`,
      blockedPhoneNumbers: device?.blockedPhoneNumbers || [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Block Outgoing Calls to a Phone Number for a Device
 */
export const blockOutgoingPhoneNumber = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    const last10 = cleanNum.length >= 10 ? cleanNum.slice(-10) : cleanNum;

    // 1. Add to Device.blockedOutgoingPhoneNumbers
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $addToSet: { blockedOutgoingPhoneNumbers: phoneNumber } },
      { new: true }
    );

    // 2. Update Contact if exists
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ]
      },
      { $set: { isOutgoingBlocked: true } }
    );

    // 3. Update all CallLog entries for this number to isOutgoingBlocked: true
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ],
      },
      { $set: { isOutgoingBlocked: true } }
    );

    // 4. Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('update-blocked-outgoing-numbers', {
        blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [phoneNumber],
      });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('update-blocked-outgoing-numbers', {
          blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [phoneNumber],
        });
      }
    }

    return res.json({
      success: true,
      message: `Outgoing calls to ${phoneNumber} blocked successfully`,
      blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Unblock Outgoing Calls to a Phone Number for a Device
 */
export const unblockOutgoingPhoneNumber = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    const last10 = cleanNum.length >= 10 ? cleanNum.slice(-10) : cleanNum;

    // 1. Remove all variations of this number from Device.blockedOutgoingPhoneNumbers
    const currentDev = await Device.findOne({ $or: [{ deviceId }, { deviceId: targetDeviceId }] });
    const updatedBlocked = (currentDev?.blockedOutgoingPhoneNumbers || []).filter((n: string) => {
      const c = n.replace(/[^0-9]/g, '');
      const cLast10 = c.length >= 10 ? c.slice(-10) : c;
      return cLast10 !== last10 && n !== phoneNumber;
    });

    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $set: { blockedOutgoingPhoneNumbers: updatedBlocked } },
      { new: true }
    );

    // 2. Update Contact
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ]
      },
      { $set: { isOutgoingBlocked: false } }
    );

    // 3. Update CallLog entries to isOutgoingBlocked: false
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: last10 } }] : [])
        ],
      },
      { $set: { isOutgoingBlocked: false } }
    );

    // 4. Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('update-blocked-outgoing-numbers', {
        blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [],
      });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('update-blocked-outgoing-numbers', {
          blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [],
        });
      }
    }

    return res.json({
      success: true,
      message: `Outgoing calls to ${phoneNumber} unblocked successfully`,
      blockedOutgoingPhoneNumbers: device?.blockedOutgoingPhoneNumbers || [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch All Blocked Calls (both saved contacts and call history / unsaved)
 */
export const getBlockedCalls = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const targetDev = await Device.findOne({
      $or: [{ deviceId }, { deviceId: targetDeviceId }],
    });

    const devBlockedIncoming: string[] = targetDev?.blockedPhoneNumbers || [];
    const devBlockedOutgoing: string[] = targetDev?.blockedOutgoingPhoneNumbers || [];

    // Also query Contact collection for blocked flags
    const blockedContacts = await Contact.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
      $or: [{ isBlocked: true }, { isOutgoingBlocked: true }],
    });

    // Also query CallLog collection for blocked flags
    const blockedCallLogs = await CallLog.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
      $or: [{ isBlocked: true }, { isOutgoingBlocked: true }],
    }).sort({ timestamp: -1 });

    // Fetch all contacts to match numbers
    const allContacts = await Contact.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
    });

    // Contact map for matching (by clean number and last 10 digits)
    const contactMap = new Map<string, any>();
    for (const c of allContacts) {
      const clean = (c.phoneNumber || '').replace(/[^0-9]/g, '');
      if (clean) {
        contactMap.set(clean, c);
        if (clean.length >= 10) {
          contactMap.set(clean.slice(-10), c);
        }
      }
    }

    // Call log map for names of unsaved numbers
    const callLogMap = new Map<string, string>();
    for (const log of blockedCallLogs) {
      const clean = (log.phoneNumber || '').replace(/[^0-9]/g, '');
      const name = (log as any).name || (log as any).contactName;
      if (clean && name && typeof name === 'string' && name.trim().length > 0 && !callLogMap.has(clean)) {
        callLogMap.set(clean, name.trim());
        if (clean.length >= 10) {
          callLogMap.set(clean.slice(-10), name.trim());
        }
      }
    }

    // Helper to resolve info for a phone number
    const resolveNumberInfo = (rawNumber: string) => {
      const clean = (rawNumber || '').replace(/[^0-9]/g, '');
      const last10 = clean.length >= 10 ? clean.slice(-10) : clean;
      const matchedContact = contactMap.get(clean) || (last10.length >= 7 ? contactMap.get(last10) : null);

      if (matchedContact) {
        return {
          id: matchedContact._id.toString(),
          deviceId: targetDeviceId,
          name: matchedContact.name || 'Unknown Contact',
          phoneNumber: matchedContact.phoneNumber || rawNumber,
          isSavedInContacts: true,
          photoUri: matchedContact.photoUri || '',
          contactSource: matchedContact.contactSource || 'Device',
          accountType: matchedContact.accountType || 'Device',
        };
      }

      const callLogName = callLogMap.get(clean) || (last10.length >= 7 ? callLogMap.get(last10) : '') || '';
      return {
        id: `unsaved_${clean || rawNumber}`,
        deviceId: targetDeviceId,
        name: callLogName || rawNumber,
        phoneNumber: rawNumber,
        isSavedInContacts: false,
        photoUri: '',
        contactSource: 'Call History',
        accountType: 'Call History',
      };
    };

    // Build incoming map
    const incomingMap = new Map<string, any>();

    for (const num of devBlockedIncoming) {
      const clean = (num || '').replace(/[^0-9]/g, '');
      const key = clean.length >= 10 ? clean.slice(-10) : clean;
      if (key && !incomingMap.has(key)) {
        const info = resolveNumberInfo(num);
        incomingMap.set(key, { ...info, isBlocked: true, isOutgoingBlocked: false });
      }
    }

    for (const c of blockedContacts) {
      if (c.isBlocked) {
        const clean = (c.phoneNumber || '').replace(/[^0-9]/g, '');
        const key = clean.length >= 10 ? clean.slice(-10) : clean;
        if (key && !incomingMap.has(key)) {
          incomingMap.set(key, {
            id: c._id.toString(),
            deviceId: targetDeviceId,
            name: c.name || 'Unknown Contact',
            phoneNumber: c.phoneNumber,
            isSavedInContacts: true,
            photoUri: c.photoUri || '',
            contactSource: c.contactSource || 'Device',
            accountType: c.accountType || 'Device',
            isBlocked: true,
            isOutgoingBlocked: !!c.isOutgoingBlocked,
          });
        }
      }
    }

    for (const l of blockedCallLogs) {
      if (l.isBlocked) {
        const clean = (l.phoneNumber || '').replace(/[^0-9]/g, '');
        const key = clean.length >= 10 ? clean.slice(-10) : clean;
        if (key && !incomingMap.has(key)) {
          const info = resolveNumberInfo(l.phoneNumber);
          incomingMap.set(key, { ...info, isBlocked: true, isOutgoingBlocked: !!l.isOutgoingBlocked });
        }
      }
    }

    // Build outgoing map
    const outgoingMap = new Map<string, any>();

    for (const num of devBlockedOutgoing) {
      const clean = (num || '').replace(/[^0-9]/g, '');
      const key = clean.length >= 10 ? clean.slice(-10) : clean;
      if (key && !outgoingMap.has(key)) {
        const info = resolveNumberInfo(num);
        outgoingMap.set(key, { ...info, isBlocked: false, isOutgoingBlocked: true });
      }
    }

    for (const c of blockedContacts) {
      if (c.isOutgoingBlocked) {
        const clean = (c.phoneNumber || '').replace(/[^0-9]/g, '');
        const key = clean.length >= 10 ? clean.slice(-10) : clean;
        if (key && !outgoingMap.has(key)) {
          outgoingMap.set(key, {
            id: c._id.toString(),
            deviceId: targetDeviceId,
            name: c.name || 'Unknown Contact',
            phoneNumber: c.phoneNumber,
            isSavedInContacts: true,
            photoUri: c.photoUri || '',
            contactSource: c.contactSource || 'Device',
            accountType: c.accountType || 'Device',
            isBlocked: !!c.isBlocked,
            isOutgoingBlocked: true,
          });
        }
      }
    }

    for (const l of blockedCallLogs) {
      if (l.isOutgoingBlocked) {
        const clean = (l.phoneNumber || '').replace(/[^0-9]/g, '');
        const key = clean.length >= 10 ? clean.slice(-10) : clean;
        if (key && !outgoingMap.has(key)) {
          const info = resolveNumberInfo(l.phoneNumber);
          outgoingMap.set(key, { ...info, isBlocked: !!l.isBlocked, isOutgoingBlocked: true });
        }
      }
    }

    // Cross-link blocked states
    for (const [key, item] of incomingMap) {
      if (outgoingMap.has(key)) {
        item.isOutgoingBlocked = true;
        outgoingMap.get(key).isBlocked = true;
      }
    }

    return res.json({
      success: true,
      blockedIncoming: Array.from(incomingMap.values()),
      blockedOutgoing: Array.from(outgoingMap.values()),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Contact (Remote deletion from child device, preserves historical call logs)
 */
export const deleteContact = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, id } = req.params;
    const phoneNumberQuery = (req.query.phoneNumber as string) || '';

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const contact = await Contact.findOne({
      deviceId: { $in: [deviceId, targetDeviceId] },
      $or: [
        ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
        { phoneNumber: id },
        ...(phoneNumberQuery ? [{ phoneNumber: phoneNumberQuery }] : []),
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    const deletedNumber = contact.phoneNumber;
    const contactId = contact._id;

    // Delete contact record only. DO NOT delete CallLog records!
    await Contact.deleteOne({ _id: contact._id });

    // Notify Child Device to delete contact remotely
    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('remote-delete-contact', {
        contactId,
        phoneNumber: deletedNumber,
      });
    }

    return res.json({
      success: true,
      message: 'Contact deleted successfully. Historical call logs preserved.',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Call Recording Configuration Settings
 */
export const getCallRecordingSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const device = await Device.findOne({ $or: [{ deviceId }, { deviceId: targetDeviceId }] });
    const mode = device?.callRecordingMode || 'all';
    const recordUnknown = device?.callRecordingRecordUnknown || false;
    const selectedNumbers = device?.callRecordingSelectedNumbers || [];

    return res.json({
      success: true,
      settings: {
        mode,
        callRecordingMode: mode,
        recordUnknown,
        callRecordingRecordUnknown: recordUnknown,
        selectedNumbers,
        callRecordingSelectedNumbers: selectedNumbers,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Call Recording Configuration Settings
 */
export const updateCallRecordingSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const mode = req.body.mode || req.body.callRecordingMode;
    const recordUnknown = req.body.recordUnknown !== undefined 
      ? req.body.recordUnknown 
      : req.body.callRecordingRecordUnknown;
    const selectedNumbers = Array.isArray(req.body.selectedNumbers)
      ? req.body.selectedNumbers
      : (Array.isArray(req.body.callRecordingSelectedNumbers) ? req.body.callRecordingSelectedNumbers : undefined);

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const update: any = {};
    if (mode) update.callRecordingMode = mode;
    if (recordUnknown !== undefined) update.callRecordingRecordUnknown = !!recordUnknown;
    if (Array.isArray(selectedNumbers)) update.callRecordingSelectedNumbers = selectedNumbers;

    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $set: update },
      { new: true }
    );

    const effectiveMode = device?.callRecordingMode || 'all';
    const effectiveRecordUnknown = device?.callRecordingRecordUnknown || false;
    const effectiveSelectedNumbers = device?.callRecordingSelectedNumbers || [];

    // Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      const payload = {
        mode: effectiveMode,
        callRecordingMode: effectiveMode,
        recordUnknown: effectiveRecordUnknown,
        callRecordingRecordUnknown: effectiveRecordUnknown,
        selectedNumbers: effectiveSelectedNumbers,
        callRecordingSelectedNumbers: effectiveSelectedNumbers,
      };
      io.to(targetDeviceId).emit('update-call-recording-settings', payload);
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('update-call-recording-settings', payload);
      }
    }

    return res.json({
      success: true,
      message: 'Call recording settings updated successfully',
      settings: {
        mode: effectiveMode,
        callRecordingMode: effectiveMode,
        recordUnknown: effectiveRecordUnknown,
        callRecordingRecordUnknown: effectiveRecordUnknown,
        selectedNumbers: effectiveSelectedNumbers,
        callRecordingSelectedNumbers: effectiveSelectedNumbers,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Aggregated Call Recording Contacts (Distinct Contacts/Numbers that have recordings)
 */
const cleanPhone = (p: string) => {
  if (!p) return '';
  try {
    return decodeURIComponent(p).replace(/%2B/gi, '+').trim();
  } catch {
    return p.replace(/%2B/gi, '+').trim();
  }
};

const cleanName = (n: string) => {
  if (!n) return '';
  try {
    return decodeURIComponent(n.replace(/\+/g, ' ')).trim();
  } catch {
    return n.replace(/\+/g, ' ').trim();
  }
};

export const getCallRecordingContacts = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    // Auto-clean any legacy encoded records in the database
    CallRecording.find({
      deviceId: { $in: [deviceId, targetDeviceId] },
      $or: [{ phoneNumber: /%/ }, { contactName: /\+/ }],
    }).then(async (records) => {
      for (const rec of records) {
        let changed = false;
        if (rec.phoneNumber && (rec.phoneNumber.includes('%') || rec.phoneNumber.startsWith('%2B'))) {
          const cp = cleanPhone(rec.phoneNumber);
          if (cp !== rec.phoneNumber) {
            rec.phoneNumber = cp;
            changed = true;
          }
        }
        if (rec.contactName && (rec.contactName.includes('+') || rec.contactName.includes('%'))) {
          const cn = cleanName(rec.contactName);
          if (cn !== rec.contactName) {
            rec.contactName = cn;
            changed = true;
          }
        }
        if (changed) {
          await rec.save();
        }
      }
    }).catch((e) => console.error('Auto-clean recording error:', e));

    const contactsAggregation = await CallRecording.aggregate([
      { $match: { deviceId: { $in: [deviceId, targetDeviceId] } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$phoneNumber',
          phoneNumber: { $first: '$phoneNumber' },
          contactName: { $first: '$contactName' },
          count: { $sum: 1 },
          recordingCount: { $sum: 1 },
          latestTimestamp: { $first: '$timestamp' },
          lastRecordingAt: { $first: '$timestamp' },
          lastDurationSeconds: { $first: '$durationSeconds' },
          lastCallType: { $first: '$callType' },
        },
      },
      { $sort: { latestTimestamp: -1 } },
    ]);

    const formattedContacts = contactsAggregation.map((c: any) => ({
      ...c,
      phoneNumber: cleanPhone(c.phoneNumber),
      contactName: cleanName(c.contactName),
    }));

    return res.json({
      success: true,
      contacts: formattedContacts,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Call Recordings with filtering by phoneNumber, date, and pagination
 */
export const getCallRecordings = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { page = 1, limit = 50, phoneNumber, date } = req.query;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const query: any = {
      deviceId: { $in: [deviceId, targetDeviceId] },
    };

    if (phoneNumber) {
      const decodedPhone = cleanPhone(phoneNumber as string);
      const cleanTarget = decodedPhone.replace(/[^0-9]/g, '');
      const lastDigits = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
      const flexRegex = lastDigits.split('').join('[^0-9]*');
      query.$or = [
        { phoneNumber: phoneNumber },
        { phoneNumber: decodedPhone },
        ...(lastDigits.length >= 5 ? [{ phoneNumber: { $regex: flexRegex, $options: 'i' } }] : []),
      ];
    }

    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [recordings, total] = await Promise.all([
      CallRecording.find(query).sort({ timestamp: -1 }).skip(skip).limit(limitNum),
      CallRecording.countDocuments(query),
    ]);

    const host = req.get('host') || 'localhost:5000';
    const baseUrl = `${req.protocol}://${host}`;

    const formattedRecordings = recordings.map((r: any) => {
      const obj = r.toObject ? r.toObject() : r;
      if (obj.audioUrl && obj.audioUrl.startsWith('/uploads')) {
        obj.audioUrl = `${baseUrl}${obj.audioUrl}`;
      }
      obj.phoneNumber = cleanPhone(obj.phoneNumber);
      obj.contactName = cleanName(obj.contactName);
      return obj;
    });

    return res.json({
      success: true,
      recordings: formattedRecordings,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Stream Call Recording Audio with HTTP 206 Partial Content (Range) Support
 * Works for both disk-based audio and legacy Base64 documents.
 */
export const streamCallRecording = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const recording = await CallRecording.findById(id);
    if (!recording || !recording.audioUrl) {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }

    if (recording.audioUrl.startsWith('/uploads')) {
      const filePath = path.join(__dirname, '../../public', recording.audioUrl);
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
    }

    if (recording.audioUrl.startsWith('data:')) {
      const commaIndex = recording.audioUrl.indexOf(',');
      const base64Str = commaIndex !== -1 ? recording.audioUrl.substring(commaIndex + 1) : recording.audioUrl;
      const buffer = Buffer.from(base64Str, 'base64');

      res.set({
        'Content-Type': 'audio/mp4',
        'Content-Length': buffer.length.toString(),
        'Accept-Ranges': 'bytes',
      });
      return res.send(buffer);
    }

    return res.redirect(recording.audioUrl);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a Single Call Recording
 */
export const deleteCallRecording = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await CallRecording.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Call recording deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Call Recordings for a Specific Day
 */
export const deleteCallRecordingsForDay = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, phoneNumber } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required (YYYY-MM-DD)' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const start = new Date(date as string);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date as string);
    end.setHours(23, 59, 59, 999);

    const query: any = {
      deviceId: { $in: [deviceId, targetDeviceId] },
      timestamp: { $gte: start, $lte: end },
    };

    if (phoneNumber) {
      const cleanTarget = (phoneNumber as string).replace(/[^0-9]/g, '');
      const lastDigits = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
      const flexRegex = lastDigits.split('').join('[^0-9]*');
      query.$or = [
        { phoneNumber: phoneNumber },
        ...(lastDigits.length >= 5 ? [{ phoneNumber: { $regex: flexRegex, $options: 'i' } }] : []),
      ];
    }

    const result = await CallRecording.deleteMany(query);
    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} call recordings for ${date}`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Call Recordings for a Device (Optionally for a specific phone number)
 */
export const deleteAllCallRecordings = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { phoneNumber } = req.query;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const query: any = {
      deviceId: { $in: [deviceId, targetDeviceId] },
    };

    if (phoneNumber) {
      const cleanTarget = (phoneNumber as string).replace(/[^0-9]/g, '');
      const lastDigits = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
      const flexRegex = lastDigits.split('').join('[^0-9]*');
      query.$or = [
        { phoneNumber: phoneNumber },
        ...(lastDigits.length >= 5 ? [{ phoneNumber: { $regex: flexRegex, $options: 'i' } }] : []),
      ];
    }

    const result = await CallRecording.deleteMany(query);
    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} call recordings`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


const IGNORED_SYSTEM_PACKAGES = new Set([
  'com.android.launcher',
  'com.sec.android.app.launcher',
  'com.miui.home',
  'com.oppo.launcher',
  'com.bbk.launcher2',
  'com.google.android.apps.nexuslauncher',
  'com.android.systemui',
  'com.google.android.permissioncontroller',
  'com.android.permissioncontroller',
  'com.google.android.packageinstaller',
  'com.android.packageinstaller',
  'com.google.android.photopicker',
  'com.android.server.telecom',
  'com.android.incallui',
  'com.android.phone',
  'com.oplus.stdsp',
  'com.oplus.wirelesssettings',
  'com.oplus.battery',
  'com.oplus.safecenter',
  'com.oplus.games',
  'com.oplus.appplatform',
  'com.coloros.assistantscreen',
  'com.coloros.smartslider',
  'com.coloros.safecenter',
  'com.oppo.quicksearchbox',
  'com.heytap.pictorial',
  'com.heytap.habit.analysis',
  'com.heytap.cloud',
  'com.heytap.mcs',
  'com.heytap.openid',
  'com.heytap.usercenter',
]);

export function isIgnoredSystemPackage(pkg: string): boolean {
  if (!pkg) return true;
  const lower = pkg.toLowerCase().trim();

  // Explicitly allow Camera and Settings apps
  if (
    lower.includes('camera') ||
    lower.includes('settings') ||
    lower.includes('calculator') ||
    lower.includes('weather') ||
    lower.includes('gallery') ||
    lower.includes('photos') ||
    lower.includes('clock')
  ) {
    if (!lower.includes('wirelesssettings') && !lower.includes('permissioncontroller')) {
      return false;
    }
  }

  if (IGNORED_SYSTEM_PACKAGES.has(lower)) return true;
  if (
    lower.includes('launcher') ||
    lower.includes('quicksearchbox') ||
    lower.includes('systemui') ||
    lower.includes('assistantscreen') ||
    lower.includes('photopicker') ||
    lower.includes('pictorial') ||
    lower.includes('lockscreen') ||
    lower.includes('magazine') ||
    lower.includes('server.telecom') ||
    lower.includes('incallui') ||
    lower.includes('permissioncontroller') ||
    lower.includes('packageinstaller')
  ) {
    return true;
  }
  if (
    lower.startsWith('com.android.internal') ||
    lower.startsWith('com.google.android.overlay') ||
    lower.startsWith('com.android.providers.') ||
    lower.startsWith('com.google.android.providers.') ||
    lower.startsWith('com.heytap.') ||
    (lower.startsWith('com.oplus.') && !lower.includes('camera') && !lower.includes('settings') && !lower.includes('calculator') && !lower.includes('weather') && !lower.includes('soundrecorder') && !lower.includes('compass')) ||
    (lower.startsWith('com.coloros.') && !lower.includes('camera') && !lower.includes('settings') && !lower.includes('calculator') && !lower.includes('weather') && !lower.includes('soundrecorder') && !lower.includes('compass'))
  ) {
    return true;
  }
  return false;
}

/**
 * Fetch App Usage & Screen Time (supports date, 90-day range startDate/endDate, and packageName)
 */
export const getAppUsage = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, startDate, endDate, packageName, limit = 1000 } = req.query;

    const query: any = { deviceId };

    if (packageName) {
      query.packageName = packageName;
    }

    if (date) {
      query.date = date;
    } else if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const rawItems = await AppUsage.find(query)
      .sort({ date: -1, usageDurationSeconds: -1 })
      .limit(Number(limit));

    // Deduplicate by packageName (for single date) or (packageName + date) for date ranges
    const dedupMap = new Map<string, any>();
    for (const item of rawItems) {
      if (isIgnoredSystemPackage(item.packageName)) continue;
      const key = date ? item.packageName : `${item.packageName}___${item.date}`;
      const existing = dedupMap.get(key);
      if (!existing) {
        dedupMap.set(key, item);
      } else {
        // Keep the record with the higher duration, or prefer non-raw appName
        const itemDur = item.usageDurationSeconds || 0;
        const existDur = existing.usageDurationSeconds || 0;
        if (itemDur > existDur || (itemDur === existDur && item.appName !== item.packageName && existing.appName === existing.packageName)) {
          dedupMap.set(key, item);
        }
      }
    }

    let items = Array.from(dedupMap.values());
    items.sort((a, b) => (b.usageDurationSeconds || 0) - (a.usageDurationSeconds || 0));

    const totalScreenTimeSeconds = items.reduce((acc, curr) => acc + (curr.usageDurationSeconds || 0), 0);

    console.log(`[PARENT-GET-APP-USAGE] Device: ${deviceId}, Date: ${date || 'range'}, TotalScreenTime: ${totalScreenTimeSeconds}s, AppCount: ${items.length}`);
    for (const item of items) {
      console.log(`  -> ${item.packageName} (${item.appName}): ${item.usageDurationSeconds}s | date=${item.date}`);
    }

    // Check device details & installed apps
    const dev = await Device.findOne({ deviceId }).select('isSyncingPastUsage pastUsageSynced lastUsageSyncTime installedApps');
    const filteredInstalled = (dev?.installedApps || []).filter((a: any) => !isIgnoredSystemPackage(a.packageName));

    return res.json({
      success: true,
      totalScreenTimeSeconds,
      items,
      allInstalledApps: filteredInstalled,
      isSyncingPastUsage: dev?.isSyncingPastUsage ?? false,
      pastUsageSynced: dev?.pastUsageSynced ?? false,
      lastUsageSyncTime: dev?.lastUsageSyncTime,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch granular App Open/Close Sessions and Hourly Breakdown for an app on a selected date
 */
export const getAppSessions = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName, date } = req.query;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const targetDate = (date && String(date).trim()) ? String(date).trim() : getISTDateString();

    if (isIgnoredSystemPackage(packageName as string)) {
      return res.json({
        success: true,
        sessions: [],
        hourlyTrend: new Array(24).fill(0).map((_, hour) => ({ hour, durationSeconds: 0 })),
        totalDurationSeconds: 0,
        date: targetDate,
        packageName,
      });
    }

    const rawSessions = await AppSession.find({
      deviceId,
      packageName,
      date: targetDate,
    }).sort({ startTime: 1 });

    // Consolidate overlapping sessions only (gap <= 0 seconds) to preserve exact session boundaries
    const mergedSessions: any[] = [];
    for (const sess of rawSessions) {
      const obj = sess.toObject ? sess.toObject() : { ...sess };
      if (!obj.sessionType) {
        obj.sessionType = 'normal';
      }

      if (mergedSessions.length === 0) {
        mergedSessions.push(obj);
      } else {
        const last = mergedSessions[mergedSessions.length - 1];
        const lastEnd = new Date(last.endTime).getTime();
        const curStart = new Date(obj.startTime).getTime();
        const curEnd = new Date(obj.endTime).getTime();
        const gapSec = (curStart - lastEnd) / 1000;

        // Merge only overlapping foreground session ranges (gapSec <= 0)
        if (
          (last.sessionType === 'normal' || !last.sessionType) &&
          obj.sessionType === 'normal' &&
          gapSec <= 0
        ) {
          const newEnd = Math.max(lastEnd, curEnd);
          last.endTime = new Date(newEnd);
          last.durationSeconds = Math.max(0, Math.round((newEnd - new Date(last.startTime).getTime()) / 1000));
        } else {
          mergedSessions.push(obj);
        }
      }
    }

    // Compute hourly trend (24 hours: 0 to 23) for the selected date (normal sessions only)
    const hourlySeconds = new Array(24).fill(0);

    for (const sess of mergedSessions) {
      if (sess.sessionType && sess.sessionType !== 'normal') continue; // Do not count attempts in duration chart

      const start = new Date(sess.startTime);
      const end = new Date(sess.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() >= end.getTime()) continue;

      let curr = new Date(start.getTime());
      while (curr.getTime() < end.getTime()) {
        const istCurr = toIST(curr);
        const currH = istCurr.getUTCHours(); // Server-independent IST hour (0..23)

        const nextIstBoundary = new Date(istCurr);
        nextIstBoundary.setUTCMinutes(60, 0, 0);
        const nextTimeAbsolute = nextIstBoundary.getTime() - IST_OFFSET_MS;

        const nextTime = Math.min(end.getTime(), nextTimeAbsolute);
        const chunkSec = Math.max(0, Math.round((nextTime - curr.getTime()) / 1000));

        if (currH >= 0 && currH < 24) {
          hourlySeconds[currH] += chunkSec;
        }
        curr = new Date(nextTime);
      }
    }

    const hourlyTrend = hourlySeconds.map((seconds, hour) => ({
      hour,
      durationSeconds: seconds,
    }));

    const totalDurationSeconds = mergedSessions
      .filter((s) => !s.sessionType || s.sessionType === 'normal')
      .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

    console.log(`[PARENT-GET-APP-SESSIONS] Device: ${deviceId}, Package: ${packageName}, Date: ${targetDate}, TotalSessions: ${mergedSessions.length}, TotalDuration: ${totalDurationSeconds}s`);
    for (const s of mergedSessions) {
      console.log(`  -> Session: ${s.startTime} -> ${s.endTime} (${s.durationSeconds}s)`);
    }

    // Return in reverse chronological order (latest session first)
    mergedSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const dev = await Device.findOne({ deviceId }).select('lastUsageSyncTime');

    return res.json({
      success: true,
      sessions: mergedSessions,
      hourlyTrend,
      totalDurationSeconds,
      date: targetDate,
      packageName,
      lastUsageSyncTime: dev?.lastUsageSyncTime,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single app usage session by ID
 */
export const deleteAppSession = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await AppSession.deleteMany({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: 'Session deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete app usage history (sessions + daily usage totals) on a device - for one app when
 * packageName is given, otherwise for every app - optionally filtered to a single date.
 */
export const deleteAppUsageForDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName, date } = req.query;

    const query: any = { deviceId };
    if (packageName) query.packageName = packageName as string;

    if (date && typeof date === 'string') {
      const parts = date.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const [y, m, d] = parts;
        const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
        query.$or = [
          { date: date },
          { timestamp: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ];
      } else {
        query.date = date;
      }

      await Device.findOneAndUpdate(
        { deviceId },
        {
          $addToSet: { clearedAppUsageDates: date },
          $set: { lastAppUsageClearedAt: new Date() }
        }
      );
    }

    const [sessionResult, usageResult] = await Promise.all([
      AppSession.deleteMany(query),
      AppUsage.deleteMany(query),
    ]);

    return res.json({
      success: true,
      deletedSessions: sessionResult.deletedCount,
      deletedUsageRecords: usageResult.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch configured App Limits for a device
 */
export const getAppLimits = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const limits = await AppLimit.find({ deviceId }).sort({ createdAt: -1 });
    return res.json({ success: true, limits });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Save or update an App Limit
 */
export const saveAppLimit = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const {
      packageName,
      appName,
      isEnabled,
      limitDurationMinutes,
      scheduleType,
      selectedDays,
      selectedDate,
      notifyOnLimitReached,
      showDialogToChild,
    } = req.body;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const limit = await AppLimit.findOneAndUpdate(
      { deviceId, packageName },
      {
        $set: {
          appName: appName || packageName,
          isEnabled: isEnabled ?? true,
          limitDurationMinutes: Number(limitDurationMinutes) || 240,
          scheduleType: scheduleType || 'all_days',
          selectedDays: Array.isArray(selectedDays) ? selectedDays : [],
          selectedDate: selectedDate || undefined,
          notifyOnLimitReached: notifyOnLimitReached ?? true,
          showDialogToChild: showDialogToChild ?? true,
        },
      },
      { new: true, upsert: true }
    );

    // Fetch all active limits for this device to push to child
    const allLimits = await AppLimit.find({ deviceId, isEnabled: true });

    // Notify child device via Socket.IO
    getSignalingIo()?.to(deviceId).emit('remote-command', {
      command: 'UPDATE_RULES',
      deviceId,
      appLimits: allLimits,
    });

    // Notify child device via FCM if token available
    const device = await Device.findOne({ deviceId });
    if (device?.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        action: 'UPDATE_APP_LIMITS',
      });
    }

    await cacheService.del(cacheService.keys.appLimits(deviceId));

    return res.json({ success: true, message: 'App limit saved successfully.', limit });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete an App Limit
 */
export const deleteAppLimit = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, packageName } = req.params;

    await AppLimit.findOneAndDelete({ deviceId, packageName });

    // Fetch remaining active limits to push to child
    const allLimits = await AppLimit.find({ deviceId, isEnabled: true });

    // Notify child device via Socket.IO
    getSignalingIo()?.to(deviceId).emit('remote-command', {
      command: 'UPDATE_RULES',
      deviceId,
      appLimits: allLimits,
    });

    // Notify child device via FCM if token available
    const device = await Device.findOne({ deviceId });
    if (device?.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        action: 'UPDATE_APP_LIMITS',
      });
    }

    await cacheService.del(cacheService.keys.appLimits(deviceId));

    return res.json({ success: true, message: 'App limit deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Call Logs for a specific date (Parent App / Database only)
 */
export const deleteSelectedDayCallLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query param (YYYY-MM-DD) is required' });
    }

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const start = new Date(date as string);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date as string);
    end.setHours(23, 59, 59, 999);

    const result = await CallLog.deleteMany({
      deviceId: { $in: [deviceId, targetDeviceId] },
      timestamp: { $gte: start, $lte: end },
    });

    await Device.updateMany(
      { deviceId: { $in: [deviceId, targetDeviceId] } },
      { $addToSet: { clearedCallLogDates: date as string } }
    );

    return res.json({
      success: true,
      message: `Deleted ${result.deletedCount} call logs for ${date}`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Call Logs for a device (Parent App / Database only)
 */
export const deleteAllCallLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const result = await CallLog.deleteMany({
      deviceId: { $in: [deviceId, targetDeviceId] },
    });

    const clearTime = new Date();
    await Device.updateOne(
      { deviceId: { $in: [deviceId, targetDeviceId] } },
      { $set: { lastCallHistoryClearedAt: clearTime } }
    );

    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('call-history-cleared', { timestamp: clearTime.getTime() });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('call-history-cleared', { timestamp: clearTime.getTime() });
      }
    }

    return res.json({
      success: true,
      message: `Deleted all ${result.deletedCount} call logs for device`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Trigger child device to force re-sync call logs and contacts
 */
export const triggerDeviceSync = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    await Device.updateOne(
      { deviceId: { $in: [deviceId, targetDeviceId] } },
      { $unset: { lastCallHistoryClearedAt: 1 } }
    );

    // Optional per-feature sync: parent can request ONLY one feature's pending data
    // (e.g. { feature: "wifi" }) so opening the Wi-Fi screen doesn't flush everything.
    // When no feature is given, behaviour is the original full device sync.
    const feature = (req.body && req.body.feature) ? String(req.body.feature) : '';
    const io = getSignalingIo();

    // Is the child's realtime socket currently connected? Good proxy for "reachable now".
    // If the child has no internet / is powered off, it will NOT be in the signaling room,
    // so we must NOT pretend the sync happened (the parent relies on this to avoid showing
    // a fresh "last synced" time when nothing actually synced).
    let childOnline = false;
    if (io) {
      const room = (io.adapter?.rooms?.get(targetDeviceId)) || (io.adapter?.rooms?.get(deviceId));
      if (room) {
        for (const sid of room) {
          const s: any = io.sockets?.get(sid);
          if (s && s.data?.role === 'child') { childOnline = true; break; }
        }
      }
    }

    if (feature) {
      if (!childOnline) {
        return res.json({
          success: true,
          online: false,
          delivered: false,
          message: 'Child device is offline or has no internet connection',
        });
      }
      io.to(targetDeviceId).emit('remote-command', { command: 'SYNC_FEATURE', deviceId: targetDeviceId, feature });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('remote-command', { command: 'SYNC_FEATURE', deviceId, feature });
      }
      return res.json({ success: true, online: true, delivered: true, message: 'Feature sync signal sent' });
    }

    // ---- Full device sync (legacy / full "Sync Now") ----
    if (io) {
      io.to(targetDeviceId).emit('trigger-sync', { force: true });
      io.to(targetDeviceId).emit('remote-command', { command: 'TRIGGER_SYNC', deviceId: targetDeviceId });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('trigger-sync', { force: true });
        io.to(deviceId).emit('remote-command', { command: 'TRIGGER_SYNC', deviceId });
      }
    }

    const device = await Device.findOne({ deviceId: { $in: [deviceId, targetDeviceId] } });
    if (device?.fcmToken) {
      await sendFcmDataCommand(device.fcmToken, 'TRIGGER_SYNC', { force: 'true' }).catch((e) => console.error('FCM sync error:', e));
    }

    return res.json({
      success: true,
      online: childOnline,
      message: 'Sync signal transmitted to child device successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch configured App Block Rules for a device
 */
export const getAppBlockRules = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const rules = await AppBlockRule.find({ deviceId }).sort({ createdAt: -1 });
    return res.json({ success: true, rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Save or update an App Block Rule
 */
export const saveAppBlockRule = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const {
      packageName,
      appName,
      scheduleType,
      selectedDays,
      selectedDate,
      isFullDay,
      scheduleStartTime,
      scheduleEndTime,
      notifyParentOnAccess,
      notifyChildOnBlock,
      isBlocked,
    } = req.body;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const validSchedules = ['all_days', 'weekdays', 'weekends', 'once', 'selected_days'];
    const fullDay = isFullDay ?? true;

    const rule = await AppBlockRule.findOneAndUpdate(
      { deviceId, packageName },
      {
        $set: {
          appName: appName || packageName,
          scheduleType: validSchedules.includes(scheduleType) ? scheduleType : 'all_days',
          selectedDays: Array.isArray(selectedDays) ? selectedDays.map(Number) : [],
          selectedDate: selectedDate || undefined,
          isFullDay: fullDay,
          scheduleStartTime: fullDay ? '00:00' : scheduleStartTime || '09:00',
          scheduleEndTime: fullDay ? '23:59' : scheduleEndTime || '17:00',
          notifyParentOnAccess: notifyParentOnAccess ?? true,
          notifyChildOnBlock: notifyChildOnBlock ?? true,
          isBlocked: isBlocked ?? true,
        },
        // Drop fields from the old schema so they can't shadow the new ones
        $unset: { blockType: 1, blockMode: 1, startTime: 1, endTime: 1, notifyParent: 1, notifyChild: 1 },
      },
      { upsert: true, new: true, strict: false }
    );

    // Push updated rules to child device via WebRTC/Socket and FCM
    const allRules = await AppBlockRule.find({ deviceId });
    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('update-rules', {
        type: 'UPDATE_RULES',
        appBlockRules: allRules,
      });
      io.to(deviceId).emit('remote-command', {
        command: 'UPDATE_RULES',
        deviceId,
        appBlockRules: allRules,
      });
    }

    const device = await Device.findOne({ deviceId });
    if (device?.fcmToken) {
      sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        action: 'UPDATE_APP_BLOCKS',
      }).catch((err) => console.warn('[FCM] Error pushing app block rule:', err.message));
    }

    await cacheService.del(cacheService.keys.appBlocks(deviceId));

    return res.json({ success: true, rule });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete an App Block Rule
 */
export const deleteAppBlockRule = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName } = req.query;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    await AppBlockRule.findOneAndDelete({ deviceId, packageName: packageName as string });

    const allRules = await AppBlockRule.find({ deviceId });
    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('update-rules', {
        type: 'UPDATE_RULES',
        appBlockRules: allRules,
      });
      io.to(deviceId).emit('remote-command', {
        command: 'UPDATE_RULES',
        deviceId,
        appBlockRules: allRules,
      });
    }

    const device = await Device.findOne({ deviceId });
    if (device?.fcmToken) {
      sendFcmDataCommand(device.fcmToken, 'UPDATE_RULES', {
        action: 'UPDATE_APP_BLOCKS',
      }).catch((err) => console.warn('[FCM] Error pushing app block rules deletion:', err.message));
    }

    await cacheService.del(cacheService.keys.appBlocks(deviceId));

    return res.json({ success: true, message: 'Block rule removed successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ====================================================================================
// NOTIFICATION CENTER (all notifications the child device received, grouped by app)
// ====================================================================================

/**
 * One row per app that has ever posted a notification: unread/total counts + last activity,
 * for the Notification Center home screen.
 */
export const getNotificationApps = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    const agg = await ChildNotification.aggregate([
      { $match: { deviceId } },
      {
        $group: {
          _id: '$packageName',
          appName: { $last: '$appName' },
          totalCount: { $sum: 1 },
          unreadCount: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          lastNotificationAt: { $max: '$timestamp' },
        },
      },
      { $sort: { lastNotificationAt: -1 } },
    ]);

    const dev = await Device.findOne({ deviceId }).select('installedApps lastNotificationSyncTime');
    const iconMap = new Map<string, string | undefined>(
      (dev?.installedApps || []).map((a: any) => [a.packageName, a.appIcon])
    );

    const apps = agg.map((a) => ({
      packageName: a._id,
      appName: a.appName,
      appIcon: iconMap.get(a._id) || null,
      totalCount: a.totalCount,
      unreadCount: a.unreadCount,
      lastNotificationAt: a.lastNotificationAt,
    }));

    return res.json({ success: true, apps, lastSyncTime: dev?.lastNotificationSyncTime || null });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch all installed apps on the child device
 */
export const getInstalledApps = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId }).select('installedApps');
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found', apps: [] });
    }
    const apps = (device.installedApps || []).map((a: any) => ({
      packageName: a.packageName,
      appName: a.appName || a.packageName,
      appIcon: a.appIcon || null,
      isSystemApp: a.isSystemApp || false,
    }));
    return res.json({ success: true, apps });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message, apps: [] });
  }
};

/**
 * Notifications for one app on one day (defaults to today, IST).

 */
export const getNotificationsForApp = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName, date } = req.query;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const query: any = { deviceId, packageName };
    if (date && String(date).trim() !== '' && String(date).toLowerCase() !== 'all') {
      query.date = String(date).trim();
    }

    const items = await ChildNotification.find(query).sort({ timestamp: -1 });

    return res.json({ success: true, notifications: items, date: query.date || 'all' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Full detail of one notification. Marks it read the first time it's opened.
 */
export const getNotificationDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, id } = req.params;

    const doc = await ChildNotification.findOneAndUpdate(
      { _id: id, deviceId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, notification: doc });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, id } = req.params;
    const deleted = await ChildNotification.findOneAndDelete({ _id: id, deviceId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteNotificationsForDay = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName, date } = req.query;
    if (!packageName || !date) {
      return res.status(400).json({ success: false, message: 'packageName and date are required' });
    }
    const result = await ChildNotification.deleteMany({ deviceId, packageName, date });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAllNotificationsForApp = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName } = req.query;
    // With packageName: that one app's notifications. Without: every notification on the device.
    const query: any = { deviceId };
    if (packageName) query.packageName = packageName as string;
    const result = await ChildNotification.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Marks notifications read. With `packageName`, scopes to that one app (all its dates);
 * without it, marks every unread notification for the device across all apps.
 */
export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName } = req.query;

    const filter: any = { deviceId, isRead: false };
    if (packageName) filter.packageName = packageName;

    const result = await ChildNotification.updateMany(filter, { $set: { isRead: true } });
    return res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Location History with Date Filter for Parent App
 */
export const getLocationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, limit = 1000 } = req.query;

    let targetDeviceId = deviceId;
    if (mongoose.isValidObjectId(deviceId)) {
      const dev = await Device.findById(deviceId);
      if (dev && dev.deviceId) {
        targetDeviceId = dev.deviceId;
      }
    }

    const query: any = {
      $or: [
        { deviceId },
        { deviceId: targetDeviceId },
      ],
    };

    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);

      query.$and = [
        { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
        {
          $or: [
            { date: date as string },
            { timestamp: { $gte: start, $lte: end } },
          ],
        },
      ];
      delete query.$or;
    }

    const logs = await LocationLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    const dev = await Device.findOne({ $or: [{ deviceId }, { deviceId: targetDeviceId }] }).select('lastLocationSyncTime lastLocation isOnline batteryLevel');

    let movingCount = 0;
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].isMoving) movingCount++;
    }

    return res.json({
      success: true,
      data: logs,
      items: logs,
      totalCount: logs.length,
      lastSyncTime: dev?.lastLocationSyncTime,
      lastLocation: dev?.lastLocation,
      isOnline: dev?.isOnline || false,
      batteryLevel: dev?.batteryLevel || 100,
      summary: {
        movingCount,
        totalPoints: logs.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Child Live Location State
 */
export const getLiveLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;

    const dev = await Device.findOne({ deviceId }).select('lastLocation lastLocationSyncTime isOnline batteryLevel deviceName');
    const latestLog = await LocationLog.findOne({ deviceId }).sort({ timestamp: -1 });

    const liveData = dev?.lastLocation || (latestLog ? {
      latitude: latestLog.latitude,
      longitude: latestLog.longitude,
      altitude: latestLog.altitude,
      speed: latestLog.speed,
      heading: latestLog.heading,
      accuracy: latestLog.accuracy,
      address: latestLog.locationAddress || latestLog.locationName,
      activityType: latestLog.activityType,
      isMoving: latestLog.isMoving,
      updatedAt: latestLog.timestamp,
    } : null);

    return res.json({
      success: true,
      liveLocation: liveData,
      isOnline: dev?.isOnline || false,
      batteryLevel: dev?.batteryLevel || 100,
      lastSyncTime: dev?.lastLocationSyncTime,
      deviceName: dev?.deviceName || 'Child Device',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Location History for a specific date
 */
export const deleteLocationHistoryForDay = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const parts = date.split('-').map(Number);
    let dateFilter: any = { date: date as string };
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const [y, m, d] = parts;
      const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      dateFilter = {
        $or: [
          { date: date as string },
          { timestamp: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ]
      };
    }

    await Device.findOneAndUpdate(
      { deviceId },
      {
        $addToSet: { clearedLocationDates: date as string },
        $set: { lastLocationClearedAt: new Date() }
      }
    );

    const result = await LocationLog.deleteMany({ deviceId, ...dateFilter });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Location History for a device
 */
export const deleteAllLocationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const result = await LocationLog.deleteMany({ deviceId });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single Location log item by ID
 */
export const deleteLocationLogItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await LocationLog.deleteMany({ $or: [{ _id: id }, { id }] });
    return res.json({ success: true, message: 'Location log entry deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Driving History & Detected Trips for Parent App
 */
export const getDrivingHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    const query: any = { deviceId };
    if (date) {
      query.date = date as string;
    }

    const dev = await Device.findOne({ deviceId }).select('lastLocationSyncTime isOnline batteryLevel');
    const dbTrips = await DrivingTrip.find(query).sort({ startTime: -1 }).lean();

    const filteredTrips = (dbTrips || []).filter((dt) => (dt.distanceKm >= 0.05 || dt.durationSeconds >= 30));

    const finalTrips = filteredTrips.map((dt) => {
      const rawMode = String(dt.activityMode || '').toUpperCase();
      const mode = (rawMode === 'RUNNING' || rawMode === 'WALKING' || (dt.avgSpeedKmH || 0) <= 15) ? 'WALKING' : 'DRIVING';
      return {
        id: dt._id.toString(),
        tripId: dt.tripId,
        status: dt.status,
        activityMode: mode,
        distanceKm: Math.round((dt.distanceKm || 0) * 100.0) / 100.0,
        durationSeconds: dt.durationSeconds,
        durationText: dt.durationText,
        avgSpeedKmH: Math.min(120, dt.avgSpeedKmH || 0),
        maxSpeedKmH: Math.min(120, Math.max(dt.avgSpeedKmH || 0, dt.maxSpeedKmH || 0)),
        startTime: dt.startTime,
        endTime: dt.endTime,
        startAddress: dt.startAddress,
        endAddress: dt.endAddress,
        startLat: dt.startLat,
        startLng: dt.startLng,
        endLat: dt.endLat,
        endLng: dt.endLng,
        routePoints: Array.isArray(dt.routePoints) ? dt.routePoints : [],
        date: dt.date,
      };
    });

    return res.json({
      success: true,
      trips: finalTrips,
      items: finalTrips,
      totalCount: finalTrips.length,
      lastSyncTime: dev?.lastLocationSyncTime,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};



/**
 * Delete Driving Trips for a specific day
 */
export const deleteDrivingHistoryForDay = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const result = await DrivingTrip.deleteMany({ deviceId, date: date as string });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Driving History for a device
 */
export const deleteAllDrivingHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const result = await DrivingTrip.deleteMany({ deviceId });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single Driving Trip item by ID
 */
export const deleteDrivingTripItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await DrivingTrip.deleteMany({ $or: [{ _id: id }, { tripId: id }] });
    return res.json({ success: true, message: 'Driving trip entry deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// KEYBOARD TRACKER HANDLERS
// ==========================================

/**
 * Fetch list of monitored keywords for a device
 */
export const getMonitoredKeywords = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId });
    return res.json({
      success: true,
      keywords: device?.monitoredKeywords || [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add a new monitored keyword
 */
export const addMonitoredKeyword = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const keyword = (req.body.keyword || '').toString().trim();
    if (!keyword) {
      return res.status(400).json({ success: false, message: 'keyword is required' });
    }

    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice && existingDevice.monitoredKeywords && existingDevice.monitoredKeywords.length >= 50) {
      if (!existingDevice.monitoredKeywords.includes(keyword)) {
        return res.status(400).json({
          success: false,
          message: 'Maximum limit of 50 monitored keywords reached for this device',
          keywords: existingDevice.monitoredKeywords,
        });
      }
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $addToSet: { monitoredKeywords: keyword } },
      { new: true }
    );

    const updatedKeywords = device?.monitoredKeywords || [];

    // Socket.io push to child app
    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('update-monitored-keywords', { keywords: updatedKeywords });
    }

    return res.json({
      success: true,
      message: `Keyword "${keyword}" added successfully`,
      keywords: updatedKeywords,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a monitored keyword
 */
export const deleteMonitoredKeyword = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const keyword = (req.body.keyword || req.query.keyword || '').toString().trim();
    if (!keyword) {
      return res.status(400).json({ success: false, message: 'keyword is required' });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $pull: { monitoredKeywords: keyword } },
      { new: true }
    );

    const updatedKeywords = device?.monitoredKeywords || [];

    // Socket.io push to child app
    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('update-monitored-keywords', { keywords: updatedKeywords });
    }

    return res.json({
      success: true,
      message: `Keyword "${keyword}" deleted successfully`,
      keywords: updatedKeywords,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Keyboard History logs with optional date filter (YYYY-MM-DD)
 */
export const getKeyboardHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, page = 1, limit = 100 } = req.query;

    const query: any = { deviceId };

    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total, dev] = await Promise.all([
      KeyboardLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(limitNum),
      KeyboardLog.countDocuments(query),
      Device.findOne({ deviceId }).select('lastKeyboardSyncTime isOnline batteryLevel'),
    ]);

    return res.json({
      success: true,
      data: logs,
      logs,
      items: logs,
      total,
      lastSyncTime: dev?.lastKeyboardSyncTime,
      isOnline: dev?.isOnline ?? false,
      batteryLevel: dev?.batteryLevel ?? 100,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete Keyboard History for a specific day
 */
export const deleteKeyboardHistoryForDay = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const parts = date.split('-').map(Number);
    let dateFilter: any = { date: date as string };
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const [y, m, d] = parts;
      const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      dateFilter = {
        $or: [
          { date: date as string },
          { timestamp: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ]
      };
    }

    await Device.findOneAndUpdate(
      { deviceId },
      {
        $addToSet: { clearedKeyboardDates: date as string },
        $set: { lastKeyboardClearedAt: new Date() }
      }
    );

    const result = await KeyboardLog.deleteMany({ deviceId, ...dateFilter });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete All Keyboard History for a device
 */
export const deleteAllKeyboardHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const result = await KeyboardLog.deleteMany({ deviceId });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a single Keyboard Log entry by ID
 */
export const deleteKeyboardLogItem = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await KeyboardLog.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Keyboard log entry deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};




