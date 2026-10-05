import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ChildMessage, MessageCategory, MessageDirection } from '../models/ChildMessage';
import { Device } from '../models/Device';
import { getReadQuery } from '../dal/db.dal';

function getLocalDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Categorized once at ingest time so every later read/filter is free (no per-request regex scans).
const OTP_RE = /\b\d{4,8}\b.{0,20}\b(otp|one[- ]?time|verification code|passcode)\b|\b(otp|verification code)\b.{0,20}\b\d{4,8}\b/i;
const TXN_RE = /\b(debited|credited|withdrawn|deposited|a\/c|acct|account)\b.{0,40}\b(rs\.?|inr|₹)\s?\d|\b(rs\.?|inr|₹)\s?\d[\d,]*\.?\d*\b.{0,40}\b(debited|credited|spent|paid|withdrawn)\b|\bavailable balance\b|\btransaction (of|alert)\b/i;
const SUB_RE = /\b(subscribe|subscription|unsubscribe|jio|airtel|vodafone|vi|fashion factory|pantaloons|trends|myntra|amazon|flipkart|meesho|nykaa|zomato|swiggy|uber|ola|kotak|hdfc|icici|sbi|axis|pnb|paytm|phonepe|cred)\b/i;
const PROMO_RE = /\b(sale|offer|discount|cashback|coupon|deal|off on|limited time|unsubscribe|% off|recharge|credit card)\b/i;
const MISSED_CALL_RE = /\b(missed call|miss call|call alert|call available|called you|attempted to call|misscall|callal|contact)\b/i;

export function categorizeMessage(body: string, address?: string): MessageCategory {
  const text = (body || '').trim();
  const addr = (address || '').trim();

  // 1. Missed call alerts, call available alerts, contacts, unknown numbers MUST BE PERSONAL!
  if (MISSED_CALL_RE.test(text) || MISSED_CALL_RE.test(addr) || /callal|missed|misscall|calls/i.test(addr)) {
    return 'personal';
  }

  // 2. Alphanumeric Brand Sender IDs or RCS/RBM bot agents
  if (addr && (RegExp(/[a-zA-Z]/).test(addr) || addr.includes('@rbm.goog') || addr.includes('_agent'))) {
    return 'subscription';
  }

  // 3. Known brand subscription / promo keywords
  if (SUB_RE.test(text) || SUB_RE.test(addr) || PROMO_RE.test(text)) {
    return 'subscription';
  }

  return 'personal';
}

/**
 * Batch upsert of SMS/MMS from the child device. Idempotent on (deviceId, nativeId, isMms), so a
 * retried or overlapping upload never creates duplicates. Capped at 500/request like the other
 * high-volume ingest endpoints (notifications, YouTube).
 */
export const ingestMessages = async (req: Request, res: Response) => {
  try {
    const { deviceId, messages } = req.body;
    if (!deviceId || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'deviceId and messages[] are required' });
    }

    const ops = messages
      .filter((m: any) => m && m.nativeId && m.address && m.timestamp)
      .slice(0, 500)
      .map((m: any) => {
        const timestamp = new Date(m.timestamp);
        const body = m.body ? String(m.body).slice(0, 4000) : '';
        const address = String(m.address).trim();
        return {
          updateOne: {
            filter: { deviceId, nativeId: String(m.nativeId), isMms: !!m.isMms },
            update: {
              $setOnInsert: {
                deviceId,
                nativeId: String(m.nativeId),
                address,
                contactName: m.contactName ? String(m.contactName).slice(0, 200) : undefined,
                contactPhotoBase64: m.contactPhotoBase64 ? String(m.contactPhotoBase64) : undefined,
                direction: (m.direction === 'sent' ? 'sent' : 'received') as MessageDirection,
                isMms: !!m.isMms,
                body,
                imageBase64: m.imageBase64 ? String(m.imageBase64) : undefined,
                category: categorizeMessage(body, address),
                timestamp,
                date: (m.date && String(m.date).trim()) || getLocalDateString(timestamp.getTime()),
                isRead: false,
              },
            },
            upsert: true,
          },
        };
      });

    if (ops.length > 0) {
      await ChildMessage.bulkWrite(ops, { ordered: false });
    }

    if (deviceId) await Device.findOneAndUpdate({ deviceId }, { $set: { lastMessageSyncTime: new Date() } });
    return res.json({ success: true, count: ops.length });
  } catch (error: any) {
    console.error('[MESSAGES] Ingest error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Conversations for a device (one row per phone number), newest first - mirrors the Notification
 * Center app-list pattern.
 */
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { date, category } = req.query;

    const match: any = { deviceId };
    if (date && String(date).trim() && String(date).trim() !== 'all') {
      match.date = String(date).trim();
    }
    if (category && String(category).trim() !== 'all') {
      const cat = String(category).trim();
      if (cat === 'subscription') {
        match.$and = [
          {
            $or: [
              { category: 'subscription' },
              { address: { $regex: /[a-zA-Z]/ } },
              { address: { $regex: /jio|airtel|fashion|flpkrt|amazon|zomato|swiggy|vodafone|vi|myntra|meesho|nykaa/i } },
            ],
          },
          { address: { $not: { $regex: /callal|missed|misscall|calls/i } } },
          { body: { $not: { $regex: /missed call|miss call|call alert|call available|called you/i } } },
        ];
      } else if (cat === 'personal') {
        match.$or = [
          { category: 'personal' },
          { address: { $regex: /callal|missed|misscall|calls/i } },
          { body: { $regex: /missed call|miss call|call alert|call available|called you/i } },
        ];
      } else {
        match.category = cat;
      }
    }

    const agg = await ChildMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$address',
          contactName: { $last: '$contactName' },
          contactPhotoBase64: { $last: '$contactPhotoBase64' },
          totalCount: { $sum: 1 },
          unreadCount: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          lastMessageAt: { $max: '$timestamp' },
          lastBody: { $last: '$body' },
          lastIsMms: { $last: '$isMms' },
          lastDirection: { $last: '$direction' },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    const dev = await Device.findOne({ deviceId }).select('lastMessageSyncTime');

    const conversations = agg.map((a) => ({
      address: a._id,
      contactName: a.contactName || null,
      contactPhotoBase64: a.contactPhotoBase64 || null,
      totalCount: a.totalCount,
      unreadCount: a.unreadCount,
      lastMessageAt: a.lastMessageAt,
      lastBody: a.lastIsMms && !a.lastBody ? '📷 Photo' : a.lastBody,
      lastDirection: a.lastDirection,
    }));

    return res.json({ success: true, conversations, lastSyncTime: dev?.lastMessageSyncTime || null });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Messages in one conversation (chronological thread view).
 * If date is omitted or empty, fetches all messages in the thread across all dates.
 */
export const getMessagesForConversation = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { address, date, category } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, message: 'address is required' });
    }

    const query: any = { deviceId, address };
    if (date && String(date).trim() && String(date).trim() !== 'all') {
      query.date = String(date).trim();
    }
    if (category && String(category).trim() !== 'all') {
      query.category = String(category).trim();
    }

    const messages = await getReadQuery(ChildMessage).find(query).sort({ timestamp: 1 });

    // Deduplicate in case existing database records have duplicate messages from millisecond timestamp mismatches
    const uniqueMessages: typeof messages = [];
    const seenMap = new Map<string, boolean>();

    for (const msg of messages) {
      const timeBucket = Math.floor(new Date(msg.timestamp).getTime() / 10000);
      const key = `${(msg.body || '').trim()}|${msg.direction}|${timeBucket}`;
      if (!seenMap.has(key)) {
        seenMap.set(key, true);
        uniqueMessages.push(msg);
      }
    }

    return res.json({ success: true, messages: uniqueMessages });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** One message's full details; marks it read. */
export const getMessageDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const message = await ChildMessage.findByIdAndUpdate(id, { $set: { isRead: true } }, { new: true });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** With address: that conversation only. Without: every unread message on the device. */
export const markAllMessagesRead = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { address } = req.query;
    const filter: any = { deviceId, isRead: false };
    if (address) filter.address = address;
    const result = await ChildMessage.updateMany(filter, { $set: { isRead: true } });
    return res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await ChildMessage.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Message deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** With address: delete that conversation (optionally one day). Without: delete everything. */
export const deleteMessagesForDevice = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { address, date } = req.query;
    const query: any = { deviceId };
    if (address) query.address = address;

    if (date && typeof date === 'string') {
      const parts = date.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const [y, m, d] = parts;
        const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
        query.$or = [
          { date: date },
          { timestamp: { $gte: startOfDay, $lte: endOfDay } },
          { messageDate: { $gte: startOfDay, $lte: endOfDay } },
          { createdAt: { $gte: startOfDay, $lte: endOfDay } }
        ];
      } else {
        query.date = date;
      }

      await Device.findOneAndUpdate(
        { deviceId },
        {
          $addToSet: { clearedSmsDates: date },
          $set: { lastSmsClearedAt: new Date() }
        }
      );
    }

    const result = await ChildMessage.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
