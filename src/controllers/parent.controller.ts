import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
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
import { getSignalingIo } from '../signaling/webrtc.signaling';

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
    const blockedIncomingSet = new Set((targetDev?.blockedPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '').slice(-10)));
    const blockedOutgoingSet = new Set((targetDev?.blockedOutgoingPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '').slice(-10)));

    const sanitizedContacts = contacts.map((c: any) => {
      const obj = c.toObject ? c.toObject() : c;
      const clean = (obj.phoneNumber || '').replace(/[^0-9]/g, '');
      const isIncomingBlocked = (clean.length >= 10 && blockedIncomingSet.has(clean.slice(-10))) || !!obj.isBlocked;
      const isOutgoingBlocked = (clean.length >= 10 && blockedOutgoingSet.has(clean.slice(-10))) || !!obj.isOutgoingBlocked;
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
        query.isBlocked = true;
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
    const blockedSet = new Set((targetDev?.blockedPhoneNumbers || []).map((n: string) => n.replace(/[^0-9]/g, '').slice(-10)));

    const sanitizedLogs = logs.map((l: any) => {
      const obj = l.toObject ? l.toObject() : l;
      const clean = (obj.phoneNumber || '').replace(/[^0-9]/g, '');
      const isTrulyBlocked = clean.length >= 10 && blockedSet.has(clean.slice(-10));
      return {
        ...obj,
        isBlocked: isTrulyBlocked,
        callType: isTrulyBlocked ? 'blocked' : (obj.callType === 'blocked' ? 'rejected' : obj.callType),
      };
    });

    return res.json({
      success: true,
      logs: sanitizedLogs,
      recordings,
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
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ]
      },
      { $set: { isBlocked: true } }
    );

    // 3. Update CallLog entries if exists (only zero-duration/unconnected calls)
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ],
        durationSeconds: { $lte: 0 }
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

    // 1. Remove from Device.blockedPhoneNumbers
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $pull: { blockedPhoneNumbers: phoneNumber } },
      { new: true }
    );

    // 2. Update Contact
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ]
      },
      { $set: { isBlocked: false } }
    );

    // 3. Update CallLog entries
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ],
        callType: { $in: ['blocked', 'rejected'] }
      },
      { $set: { isBlocked: false, callType: 'missed' } }
    );
    await CallLog.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ]
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
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ]
      },
      { $set: { isOutgoingBlocked: true } }
    );

    // 3. Notify Child Device via Socket.io
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

    // 1. Remove from Device.blockedOutgoingPhoneNumbers
    const device = await Device.findOneAndUpdate(
      { $or: [{ deviceId }, { deviceId: targetDeviceId }] },
      { $pull: { blockedOutgoingPhoneNumbers: phoneNumber } },
      { new: true }
    );

    // 2. Update Contact
    await Contact.updateMany(
      {
        deviceId: { $in: [deviceId, targetDeviceId] },
        $or: [
          { phoneNumber },
          ...(cleanNum.length >= 7 ? [{ phoneNumber: { $regex: cleanNum.slice(-10) } }] : [])
        ]
      },
      { $set: { isOutgoingBlocked: false } }
    );

    // 3. Notify Child Device via Socket.io
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
    return res.json({
      success: true,
      settings: {
        mode: device?.callRecordingMode || 'all',
        recordUnknown: device?.callRecordingRecordUnknown || false,
        selectedNumbers: device?.callRecordingSelectedNumbers || [],
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
    const { mode, recordUnknown, selectedNumbers } = req.body;

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

    // Notify Child Device via Socket.io
    const io = getSignalingIo();
    if (io) {
      const payload = {
        mode: device?.callRecordingMode || 'all',
        recordUnknown: device?.callRecordingRecordUnknown || false,
        selectedNumbers: device?.callRecordingSelectedNumbers || [],
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
        mode: device?.callRecordingMode || 'all',
        recordUnknown: device?.callRecordingRecordUnknown || false,
        selectedNumbers: device?.callRecordingSelectedNumbers || [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Aggregated Call Recording Contacts (Distinct Contacts/Numbers that have recordings)
 */
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

    return res.json({
      success: true,
      contacts: contactsAggregation,
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
      const cleanTarget = (phoneNumber as string).replace(/[^0-9]/g, '');
      const lastDigits = cleanTarget.length >= 10 ? cleanTarget.slice(-10) : cleanTarget;
      const flexRegex = lastDigits.split('').join('[^0-9]*');
      query.$or = [
        { phoneNumber: phoneNumber },
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

    return res.json({
      success: true,
      recordings,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
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


/**
 * Fetch App Usage & Screen Time
 */
export const getAppUsage = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query;

    const query: any = { deviceId };
    if (date) query.date = date;

    const items = await AppUsage.find(query).sort({ usageDurationSeconds: -1 });
    return res.json({ success: true, items });
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
