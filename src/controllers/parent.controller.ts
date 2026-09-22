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
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { AppLimit } from '../models/AppLimit';
import { AppBlockRule } from '../models/AppBlockRule';
import { Contact } from '../models/Contact';
import { SocialMessage } from '../models/SocialMessage';
import { Device } from '../models/Device';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { sendFcmDataCommand } from '../services/fcm.service';

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

    const items = await BrowserHistory.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

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

    const items = await YouTubeHistory.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    return res.json({ success: true, items, events: items });
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

    const sessions = await YouTubeSession.find(query)
      .sort({ startTime: -1 })
      .limit(Number(limit));

    return res.json({ success: true, sessions, items: sessions });
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
    const { type, date, limit = 100 } = req.query;

    const query: any = { deviceId };
    if (type) query.type = type;
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const items = await MediaCapture.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));

    return res.json({ success: true, items, captures: items });
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
  'com.android.settings',
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
  if (IGNORED_SYSTEM_PACKAGES.has(lower)) return true;
  if (
    lower.includes('launcher') ||
    lower.includes('quicksearchbox') ||
    lower.includes('systemui') ||
    lower.includes('assistantscreen') ||
    lower.includes('photopicker') ||
    lower.includes('wirelesssettings') ||
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
    (lower.startsWith('com.oplus.') && !lower.includes('calculator') && !lower.includes('weather') && !lower.includes('soundrecorder') && !lower.includes('compass')) ||
    (lower.startsWith('com.coloros.') && !lower.includes('calculator') && !lower.includes('weather') && !lower.includes('soundrecorder') && !lower.includes('compass'))
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

    // If a specific date is requested, reconcile usageDurationSeconds with actual foreground session durations
    if (date && typeof date === 'string') {
      try {
        const sessionAgg = await AppSession.aggregate([
          {
            $match: {
              deviceId,
              date: date,
              sessionType: 'normal',
            },
          },
          {
            $group: {
              _id: '$packageName',
              totalSeconds: { $sum: '$durationSeconds' },
            },
          },
        ]);

        const sessionDurMap = new Map<string, number>();
        for (const s of sessionAgg) {
          if (s._id && typeof s.totalSeconds === 'number') {
            sessionDurMap.set(s._id, s.totalSeconds);
          }
        }

        const hasSessionRecords = (await AppSession.countDocuments({ deviceId, date })) > 0;

        for (const item of items) {
          if (hasSessionRecords) {
            item.usageDurationSeconds = sessionDurMap.get(item.packageName) || 0;
          } else if (sessionDurMap.has(item.packageName)) {
            item.usageDurationSeconds = sessionDurMap.get(item.packageName) || 0;
          }
        }
      } catch (aggErr) {
        console.warn('[getAppUsage] Error aggregating sessions:', aggErr);
      }
    }

    items.sort((a, b) => (b.usageDurationSeconds || 0) - (a.usageDurationSeconds || 0));

    const totalScreenTimeSeconds = items.reduce((acc, curr) => acc + (curr.usageDurationSeconds || 0), 0);

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

    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

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

    // Consolidate and merge adjacent / overlapping normal sessions (gap <= 10 seconds)
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

        // Merge only normal foreground sessions within a 10s grace gap
        if (
          (last.sessionType === 'normal' || !last.sessionType) &&
          obj.sessionType === 'normal' &&
          gapSec <= 10
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
      const startH = start.getHours();
      const endH = end.getHours();
      const dur = sess.durationSeconds || Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));

      if (startH === endH) {
        hourlySeconds[startH] += dur;
      } else {
        // App ran across an hour boundary - split proportionately
        const nextHour = new Date(start);
        nextHour.setMinutes(60, 0, 0);
        const firstHourDur = Math.max(0, Math.round((nextHour.getTime() - start.getTime()) / 1000));
        const remainder = Math.max(0, dur - firstHourDur);

        hourlySeconds[startH] += Math.min(dur, firstHourDur);
        hourlySeconds[endH] = (hourlySeconds[endH] || 0) + remainder;
      }
    }

    const hourlyTrend = hourlySeconds.map((seconds, hour) => ({
      hour,
      durationSeconds: seconds,
    }));

    const totalDurationSeconds = mergedSessions
      .filter((s) => !s.sessionType || s.sessionType === 'normal')
      .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

    // Return in reverse chronological order (latest session first)
    mergedSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return res.json({
      success: true,
      sessions: mergedSessions,
      hourlyTrend,
      totalDurationSeconds,
      date: targetDate,
      packageName,
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

    return res.json({ success: true, message: 'App limit deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Social Messages
 */
export const getSocialMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { contactName, date } = req.query;

    const query: any = { deviceId };
    if (contactName) query.contactName = contactName;
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      query.timestamp = { $gte: start, $lte: end };
    }

    const items = await SocialMessage.find(query).sort({ timestamp: 1 });
    return res.json({ success: true, items });
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

    const io = getSignalingIo();
    if (io) {
      io.to(targetDeviceId).emit('trigger-sync', { force: true });
      if (targetDeviceId !== deviceId) {
        io.to(deviceId).emit('trigger-sync', { force: true });
      }
    }

    return res.json({
      success: true,
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
      blockType,
      scheduleStartTime,
      scheduleEndTime,
      notifyParentOnAccess,
      notifyChildOnBlock,
      isBlocked,
    } = req.body;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const rule = await AppBlockRule.findOneAndUpdate(
      { deviceId, packageName },
      {
        deviceId,
        packageName,
        appName: appName || packageName,
        blockType: blockType || 'all_day',
        scheduleStartTime: scheduleStartTime || '09:00',
        scheduleEndTime: scheduleEndTime || '17:00',
        notifyParentOnAccess: notifyParentOnAccess ?? true,
        notifyChildOnBlock: notifyChildOnBlock ?? true,
        isBlocked: isBlocked ?? true,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
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

    return res.json({ success: true, message: 'Block rule removed successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Trigger remote uninstall intent on child device
 */
export const uninstallChildApp = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { packageName } = req.body;

    if (!packageName) {
      return res.status(400).json({ success: false, message: 'packageName is required' });
    }

    const io = getSignalingIo();
    if (io) {
      io.to(deviceId).emit('command', {
        type: 'UNINSTALL_APP',
        packageName,
      });
      io.to(deviceId).emit('remote-command', {
        command: 'UNINSTALL_APP',
        deviceId,
        packageName,
      });
    }

    const device = await Device.findOne({ deviceId });
    if (device?.fcmToken) {
      sendFcmDataCommand(device.fcmToken, 'UNINSTALL_APP', {
        packageName: String(packageName),
      }).catch((err) => console.warn('[FCM] Error pushing uninstall command:', err.message));
    }

    return res.json({
      success: true,
      message: `Uninstall request for ${packageName} sent to child device`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
