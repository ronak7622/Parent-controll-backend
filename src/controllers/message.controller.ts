import { Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth';
import { ChildMessage, MessageCategory, MessageDirection } from '../models/ChildMessage';
import { Device } from '../models/Device';
import { getReadQuery } from '../dal/db.dal';
import { checkQuotaBlocked } from './ingest.controller';
import { encryptText, decryptText, encryptDeterministic, decryptDeterministic } from '../utils/crypto.utils';
import { uploadDirectBuffer, generatePresignedGetUrl, bulkDeleteMediaFromR2 } from '../services/r2.service';
import { getDayBounds, resolveTzOffsetMinutes } from '../utils/date.utils';

function getLocalDateString(ms: number): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
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

    if (await checkQuotaBlocked(deviceId)) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_INACTIVE',
        uploadBlocked: true,
        message: 'Subscription inactive or storage full. Upload rejected.',
      });
    }

    const validMessages = messages
      .filter((m: any) => m && m.nativeId && m.address && m.timestamp)
      .slice(0, 500);

    const ops: any[] = [];
    for (const m of validMessages) {
      const timestamp = new Date(m.timestamp);
      const rawBody = m.body ? String(m.body).slice(0, 4000) : '';
      const rawAddress = String(m.address).trim();
      // Ingest-time keyword and category matching runs on plaintext before encryption
      const category = categorizeMessage(rawBody, rawAddress);
      const encryptedBody = encryptText(rawBody, deviceId);
      const encryptedAddress = encryptDeterministic(rawAddress, deviceId);
      const encryptedContactName = m.contactName ? encryptText(String(m.contactName).slice(0, 200), deviceId) : undefined;

      let imageKey: string | undefined = undefined;
      let contactPhotoKey: string | undefined = undefined;

      if (m.imageBase64 && typeof m.imageBase64 === 'string' && (m.imageBase64.startsWith('data:image') || m.imageBase64.length > 200)) {
        try {
          const cleanB64 = m.imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
          const buf = Buffer.from(cleanB64, 'base64');
          if (buf.length > 0 && buf.length <= 10 * 1024 * 1024) {
            imageKey = await uploadDirectBuffer(buf, `messages/${deviceId}/${uuidv4()}.jpg`, 'image/jpeg');
          }
        } catch (e: any) {
          console.warn('[MSG-IMAGE] Upload error:', e.message);
        }
      }

      if (m.contactPhotoBase64 && typeof m.contactPhotoBase64 === 'string' && (m.contactPhotoBase64.startsWith('data:image') || m.contactPhotoBase64.length > 200)) {
        try {
          const cleanB64 = m.contactPhotoBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
          const buf = Buffer.from(cleanB64, 'base64');
          if (buf.length > 0 && buf.length <= 10 * 1024 * 1024) {
            contactPhotoKey = await uploadDirectBuffer(buf, `contact-photos/${deviceId}/${uuidv4()}.jpg`, 'image/jpeg');
          }
        } catch (e: any) {
          console.warn('[MSG-CONTACT-PHOTO] Upload error:', e.message);
        }
      }

      ops.push({
        updateOne: {
          filter: { deviceId, nativeId: String(m.nativeId), isMms: !!m.isMms },
          update: {
            $setOnInsert: {
              deviceId,
              nativeId: String(m.nativeId),
              address: encryptedAddress,
              contactName: encryptedContactName,
              direction: (m.direction === 'sent' ? 'sent' : 'received') as MessageDirection,
              isMms: !!m.isMms,
              body: encryptedBody,
              ...(imageKey ? { imageKey } : {}),
              ...(contactPhotoKey ? { contactPhotoKey } : {}),
              category,
              timestamp,
              date: (m.date && String(m.date).trim()) || getLocalDateString(timestamp.getTime()),
              isRead: false,
            },
          },
          upsert: true,
        },
      });
    }

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
          contactPhotoKey: { $last: '$contactPhotoKey' },
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

    const conversations = await Promise.all(
      agg.map(async (a) => {
        const decBody = decryptText(a.lastBody, deviceId);
        const decAddress = decryptDeterministic(a._id, deviceId);
        const decContact = decryptText(a.contactName, deviceId);
        let photoUrl = a.contactPhotoBase64 || null;
        let legacyBase64 = a.contactPhotoBase64 || null;
        if (a.contactPhotoKey) {
          photoUrl = await generatePresignedGetUrl(a.contactPhotoKey, 900);
          legacyBase64 = null;
        }
        return {
          address: decAddress,
          contactName: decContact || null,
          contactPhotoBase64: legacyBase64,
          contactPhotoUrl: photoUrl,
          totalCount: a.totalCount,
          unreadCount: a.unreadCount,
          lastMessageAt: a.lastMessageAt,
          lastBody: a.lastIsMms && !decBody ? '📷 Photo' : decBody,
          lastDirection: a.lastDirection,
        };
      })
    );

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

    const rawAddress = String(address).trim();
    const encAddress = encryptDeterministic(rawAddress, deviceId);
    const query: any = { deviceId, address: { $in: [rawAddress, encAddress] } };
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

    const decryptedMessages = await Promise.all(
      uniqueMessages.map(async (msg: any) => {
        const obj = msg.toObject ? msg.toObject() : { ...msg };
        obj.body = decryptText(obj.body, deviceId);
        obj.contactName = decryptText(obj.contactName, deviceId);
        obj.address = decryptDeterministic(obj.address, deviceId);
        if (obj.imageKey) {
          obj.imageUrl = await generatePresignedGetUrl(obj.imageKey, 900);
          delete obj.imageKey;
        }
        if (obj.contactPhotoKey) {
          obj.contactPhotoUrl = await generatePresignedGetUrl(obj.contactPhotoKey, 900);
          delete obj.contactPhotoKey;
        }
        return obj;
      })
    );

    return res.json({ success: true, messages: decryptedMessages });
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
    const obj: any = message.toObject ? message.toObject() : message;
    obj.body = decryptText(obj.body, obj.deviceId);
    obj.contactName = decryptText(obj.contactName, obj.deviceId);
    obj.address = decryptDeterministic(obj.address, obj.deviceId);
    if (obj.imageKey) {
      obj.imageUrl = await generatePresignedGetUrl(obj.imageKey, 900);
      delete obj.imageKey;
    }
    if (obj.contactPhotoKey) {
      obj.contactPhotoUrl = await generatePresignedGetUrl(obj.contactPhotoKey, 900);
      delete obj.contactPhotoKey;
    }
    return res.json({ success: true, message: obj });
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
    if (address) {
      const rawAddress = String(address).trim();
      const encAddress = encryptDeterministic(rawAddress, deviceId);
      filter.address = { $in: [rawAddress, encAddress] };
    }
    const result = await ChildMessage.updateMany(filter, { $set: { isRead: true } });
    return res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const msg = await ChildMessage.findById(id);
    if (msg) {
      const keysToDelete: string[] = [];
      if (msg.imageKey) keysToDelete.push(msg.imageKey);
      if (msg.contactPhotoKey) keysToDelete.push(msg.contactPhotoKey);
      if (keysToDelete.length > 0) {
        bulkDeleteMediaFromR2(keysToDelete).catch((e) => console.warn('[MSG-DELETE-R2] Error:', e.message));
      }
      await ChildMessage.findByIdAndDelete(id);
    }
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
      const bounds = getDayBounds(date, resolveTzOffsetMinutes(req));
      if (bounds) {
        query.$or = [
          { timestamp: { $gte: bounds.start, $lte: bounds.end } },
          { messageDate: { $gte: bounds.start, $lte: bounds.end } },
          { createdAt: { $gte: bounds.start, $lte: bounds.end } }
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

    const msgsWithMedia = await ChildMessage.find({
      ...query,
      $or: [
        { imageKey: { $exists: true, $nin: [null, ''] } },
        { contactPhotoKey: { $exists: true, $nin: [null, ''] } },
      ],
    }).select('imageKey contactPhotoKey');
    const keysToDelete: string[] = [];
    for (const m of msgsWithMedia) {
      if (m.imageKey) keysToDelete.push(m.imageKey);
      if (m.contactPhotoKey) keysToDelete.push(m.contactPhotoKey);
    }
    if (keysToDelete.length > 0) {
      bulkDeleteMediaFromR2(keysToDelete).catch((e) => console.warn('[MSG-DELETE-ALL-R2] Error:', e.message));
    }

    const result = await ChildMessage.deleteMany(query);
    return res.json({ success: true, deletedCount: result.deletedCount });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
