import { StorageUsage, IStorageUsage } from '../models/StorageUsage';
import { Device } from '../models/Device';
import { Recording } from '../models/Recording';
import { MediaCapture } from '../models/MediaCapture';
import { CallRecording } from '../models/CallRecording';
import { cacheService } from './cache.service';

import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { CallLog } from '../models/CallLog';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { Contact } from '../models/Contact';
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { KeyboardLog } from '../models/KeyboardLog';
import { WifiLog } from '../models/wifi-log.model';
import { InternetLog } from '../models/internet-log.model';
import { ChildMessage } from '../models/ChildMessage';

export class StorageAccountingService {
  private static CACHE_PREFIX = 'storage:usage:';
  private static CACHE_TTL_SEC = 30; // 30 seconds cache for real-time responsiveness
  private static inMemoryCache = new Map<string, { data: any; expiresAt: number }>();

  /**
   * Helper to resolve parentUserId for a given deviceId or parentUserId
   */
  static async resolveParentUserId(deviceIdOrParentUserId: string): Promise<string | null> {
    if (!deviceIdOrParentUserId) return null;
    const device = await Device.findOne({
      $or: [{ deviceId: deviceIdOrParentUserId }, { _id: deviceIdOrParentUserId }],
    }).select('parentUserId');
    if (device && device.parentUserId) {
      return device.parentUserId.toString();
    }
    return deviceIdOrParentUserId; // Assume it's parentUserId if not found as device
  }

  /**
   * Recalculates storage usage directly from actual MongoDB documents across all parent devices
   */
  static async recalculateStorage(parentUserId: string): Promise<any> {
    if (!parentUserId) return null;

    const devices = await Device.find({ parentUserId, isPaired: true }).select('deviceId deviceName deviceModel');
    const deviceMap = new Map<string, string>();
    for (const d of devices) {
      deviceMap.set(d.deviceId, d.deviceName || d.deviceModel || 'Child Device');
    }
    const deviceIds = devices.map((d) => d.deviceId);

    let parentTotalVideo = 0;
    let parentTotalAudio = 0;
    let parentTotalPhoto = 0;
    let parentTotalText = 0;

    const perDeviceMap: Record<string, { videoBytes: number; audioBytes: number; photoBytes: number; textBytes: number; totalBytes: number }> = {};

    for (const dId of deviceIds) {
      perDeviceMap[dId] = { videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, totalBytes: 0 };
    }

    if (deviceIds.length > 0) {
      // 1. Recordings (video, screen, audio)
      const recordingAgg = await Recording.aggregate([
        { $match: { deviceId: { $in: deviceIds }, status: 'completed' } },
        {
          $group: {
            _id: { deviceId: '$deviceId', recordingType: '$recordingType' },
            totalBytes: { $sum: '$fileSizeBytes' },
          },
        },
      ]);

      for (const item of recordingAgg) {
        const dId = item._id.deviceId;
        const rType = item._id.recordingType;
        const bytes = item.totalBytes || 0;

        if (!perDeviceMap[dId]) {
          perDeviceMap[dId] = { videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, totalBytes: 0 };
        }

        if (rType === 'video' || rType === 'screen') {
          perDeviceMap[dId].videoBytes += bytes;
          parentTotalVideo += bytes;
        } else if (rType === 'audio') {
          perDeviceMap[dId].audioBytes += bytes;
          parentTotalAudio += bytes;
        }
      }

      // 2. Call Recordings (audio)
      const callAgg = await CallRecording.aggregate([
        { $match: { deviceId: { $in: deviceIds } } },
        { $group: { _id: '$deviceId', totalBytes: { $sum: '$fileSizeBytes' } } },
      ]);

      for (const item of callAgg) {
        const dId = item._id;
        const bytes = item.totalBytes || 0;
        if (!perDeviceMap[dId]) {
          perDeviceMap[dId] = { videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, totalBytes: 0 };
        }
        perDeviceMap[dId].audioBytes += bytes;
        parentTotalAudio += bytes;
      }

      // 3. MediaCaptures (photos / screenshots)
      const mediaAgg = await MediaCapture.aggregate([
        { $match: { deviceId: { $in: deviceIds } } },
        { $group: { _id: '$deviceId', totalBytes: { $sum: '$fileSizeBytes' } } },
      ]);

      for (const item of mediaAgg) {
        const dId = item._id;
        const bytes = item.totalBytes || 0;
        if (!perDeviceMap[dId]) {
          perDeviceMap[dId] = { videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, totalBytes: 0 };
        }
        perDeviceMap[dId].photoBytes += bytes;
        parentTotalPhoto += bytes;
      }

      // 4. Text & Database Logs
      for (const dId of deviceIds) {
        const [
          browserCount,
          internetCount,
          wifiCount,
          ytHistCount,
          ytSessCount,
          appUsageCount,
          appSessCount,
          callCount,
          contactCount,
          smsCount,
          notifCount,
          keylogCount,
          locCount,
          drivingCount,
        ] = await Promise.all([
          BrowserHistory.countDocuments({ deviceId: dId }),
          InternetLog.countDocuments({ deviceId: dId }),
          WifiLog.countDocuments({ deviceId: dId }),
          YouTubeHistory.countDocuments({ deviceId: dId }),
          YouTubeSession.countDocuments({ deviceId: dId }),
          AppUsage.countDocuments({ deviceId: dId }),
          AppSession.countDocuments({ deviceId: dId }),
          CallLog.countDocuments({ deviceId: dId }),
          Contact.countDocuments({ deviceId: dId }),
          ChildMessage.countDocuments({ deviceId: dId }),
          ChildNotification.countDocuments({ deviceId: dId }),
          KeyboardLog.countDocuments({ deviceId: dId }),
          LocationLog.countDocuments({ deviceId: dId }),
          DrivingTrip.countDocuments({ deviceId: dId }),
        ]);

        const textSum =
          browserCount * 350 +
          internetCount * 350 +
          wifiCount * 200 +
          (ytHistCount + ytSessCount) * 300 +
          appUsageCount * 250 +
          appSessCount * 250 +
          (callCount + contactCount) * 250 +
          smsCount * 300 +
          notifCount * 400 +
          keylogCount * 250 +
          locCount * 200 +
          drivingCount * 500;

        if (!perDeviceMap[dId]) {
          perDeviceMap[dId] = { videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, totalBytes: 0 };
        }
        perDeviceMap[dId].textBytes = textSum;
        parentTotalText += textSum;
      }
    }

    const perDeviceList = Object.keys(perDeviceMap).map((dId) => {
      const item = perDeviceMap[dId];
      const sum = item.videoBytes + item.audioBytes + item.photoBytes + item.textBytes;
      return {
        deviceId: dId,
        deviceName: deviceMap.get(dId) || 'Child Device',
        videoBytes: item.videoBytes,
        audioBytes: item.audioBytes,
        photoBytes: item.photoBytes,
        textBytes: item.textBytes,
        totalBytes: sum,
      };
    });

    const grandTotal = parentTotalVideo + parentTotalAudio + parentTotalPhoto + parentTotalText;

    const usageDoc = await StorageUsage.findOneAndUpdate(
      { parentUserId },
      {
        $set: {
          parentUserId,
          totalBytes: grandTotal,
          videoBytes: parentTotalVideo,
          audioBytes: parentTotalAudio,
          photoBytes: parentTotalPhoto,
          textBytes: parentTotalText,
          perDevice: perDeviceList,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return usageDoc;
  }

  /**
   * Get detailed text & database log storage breakdown for a single device across all 12 categories
   */
  static async getTextStorageBreakdown(deviceId: string, dateStr?: string) {
    if (!deviceId) return { deviceId, date: dateStr || 'all', categories: [], totalBytes: 0, totalCount: 0 };

    const filter = () => {
      const f: any = { deviceId };
      if (dateStr && dateStr !== 'all' && dateStr.trim() !== '') {
        const start = new Date(dateStr);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateStr);
        end.setHours(23, 59, 59, 999);
        f.$or = [
          { createdAt: { $gte: start, $lte: end } },
          { timestamp: { $gte: start, $lte: end } },
          { date: { $gte: start, $lte: end } },
          { startTime: { $gte: start, $lte: end } },
          { recordedAt: { $gte: start, $lte: end } },
        ];
      }
      return f;
    };

    const queryFilter = filter();

    const [
      browserCount,
      internetCount,
      wifiCount,
      ytHistCount,
      ytSessCount,
      appUsageCount,
      appSessCount,
      callCount,
      contactCount,
      smsCount,
      notifCount,
      keylogCount,
      locCount,
      drivingCount,
    ] = await Promise.all([
      BrowserHistory.countDocuments(queryFilter),
      InternetLog.countDocuments(queryFilter),
      WifiLog.countDocuments(queryFilter),
      YouTubeHistory.countDocuments(queryFilter),
      YouTubeSession.countDocuments(queryFilter),
      AppUsage.countDocuments(queryFilter),
      AppSession.countDocuments(queryFilter),
      CallLog.countDocuments(queryFilter),
      Contact.countDocuments(queryFilter),
      ChildMessage.countDocuments(queryFilter),
      ChildNotification.countDocuments(queryFilter),
      KeyboardLog.countDocuments(queryFilter),
      LocationLog.countDocuments(queryFilter),
      DrivingTrip.countDocuments(queryFilter),
    ]);

    const categories = [
      {
        category: 'browser_history',
        label: 'Browser History',
        count: browserCount,
        bytes: browserCount * 350,
        icon: 'language',
      },
      {
        category: 'internet_history',
        label: 'Internet History',
        count: internetCount,
        bytes: internetCount * 350,
        icon: 'public',
      },
      {
        category: 'wifi_history',
        label: 'Wi-Fi History',
        count: wifiCount,
        bytes: wifiCount * 200,
        icon: 'wifi',
      },
      {
        category: 'youtube_history',
        label: 'YouTube History',
        count: ytHistCount + ytSessCount,
        bytes: (ytHistCount + ytSessCount) * 300,
        icon: 'play_circle',
      },
      {
        category: 'app_usage_history',
        label: 'App Uses History',
        count: appUsageCount,
        bytes: appUsageCount * 250,
        icon: 'apps',
      },
      {
        category: 'app_session_history',
        label: 'App Session History',
        count: appSessCount,
        bytes: appSessCount * 250,
        icon: 'hourglass_empty',
      },
      {
        category: 'call_history',
        label: 'Call History',
        count: callCount + contactCount,
        bytes: (callCount + contactCount) * 250,
        icon: 'phone',
      },
      {
        category: 'sms_history',
        label: 'SMS History',
        count: smsCount,
        bytes: smsCount * 300,
        icon: 'sms',
      },
      {
        category: 'notification_history',
        label: 'Notification History',
        count: notifCount,
        bytes: notifCount * 400,
        icon: 'notifications',
      },
      {
        category: 'keyword_tracker_history',
        label: 'Keyword Tracker History',
        count: keylogCount,
        bytes: keylogCount * 250,
        icon: 'keyboard',
      },
      {
        category: 'location_history',
        label: 'Location History',
        count: locCount,
        bytes: locCount * 200,
        icon: 'location_on',
      },
      {
        category: 'driving_history',
        label: 'Driving Detection History',
        count: drivingCount,
        bytes: drivingCount * 500,
        icon: 'directions_car',
      },
    ];

    const totalBytes = categories.reduce((sum, c) => sum + c.bytes, 0);
    const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

    return {
      deviceId,
      date: dateStr || 'all',
      categories,
      totalBytes,
      totalCount,
    };
  }

  /**
   * Clear text category data for a specific device and category (or all categories)
   */
  static async clearTextCategoryData(deviceId: string, category: string, dateStr?: string, parentUserId?: string) {
    if (!deviceId) return false;

    const buildFilter = () => {
      const f: any = { deviceId };
      if (dateStr && dateStr !== 'all' && dateStr.trim() !== '') {
        const start = new Date(dateStr);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateStr);
        end.setHours(23, 59, 59, 999);
        f.$or = [
          { createdAt: { $gte: start, $lte: end } },
          { timestamp: { $gte: start, $lte: end } },
          { date: { $gte: start, $lte: end } },
          { startTime: { $gte: start, $lte: end } },
          { recordedAt: { $gte: start, $lte: end } },
        ];
      }
      return f;
    };

    const f = buildFilter();

    switch (category) {
      case 'browser_history':
        await BrowserHistory.deleteMany(f);
        break;
      case 'internet_history':
        await InternetLog.deleteMany(f);
        break;
      case 'wifi_history':
        await WifiLog.deleteMany(f);
        break;
      case 'youtube_history':
        await Promise.all([
          YouTubeHistory.deleteMany(f),
          YouTubeSession.deleteMany(f),
        ]);
        break;
      case 'app_usage_history':
        await AppUsage.deleteMany(f);
        break;
      case 'app_session_history':
        await AppSession.deleteMany(f);
        break;
      case 'call_history':
        await Promise.all([
          CallLog.deleteMany(f),
          Contact.deleteMany(f),
        ]);
        break;
      case 'sms_history':
        await ChildMessage.deleteMany(f);
        break;
      case 'notification_history':
        await ChildNotification.deleteMany(f);
        break;
      case 'keyword_tracker_history':
        await KeyboardLog.deleteMany(f);
        break;
      case 'location_history':
        await LocationLog.deleteMany(f);
        break;
      case 'driving_history':
        await DrivingTrip.deleteMany(f);
        break;
      case 'all':
      case 'all_text':
      default:
        await Promise.all([
          BrowserHistory.deleteMany(f),
          InternetLog.deleteMany(f),
          WifiLog.deleteMany(f),
          YouTubeHistory.deleteMany(f),
          YouTubeSession.deleteMany(f),
          AppUsage.deleteMany(f),
          AppSession.deleteMany(f),
          CallLog.deleteMany(f),
          Contact.deleteMany(f),
          ChildMessage.deleteMany(f),
          ChildNotification.deleteMany(f),
          KeyboardLog.deleteMany(f),
          LocationLog.deleteMany(f),
          DrivingTrip.deleteMany(f),
        ]);
        break;
    }

    const parentId = parentUserId || (await this.resolveParentUserId(deviceId));
    if (parentId) {
      await this.recalculateStorage(parentId);
    }
    return true;
  }

  /**
   * Update storage and invalidate cache
   */
  static async updateStorage(
    parentUserId: string,
    deviceId: string,
    category: 'video' | 'audio' | 'photo' | 'text',
    byteDelta: number
  ): Promise<void> {
    if (!parentUserId || byteDelta === 0) return;
    try {
      this.inMemoryCache.delete(parentUserId);
      await cacheService.del(`${this.CACHE_PREFIX}${parentUserId}`);
      await this.recalculateStorage(parentUserId);
    } catch (err: any) {
      console.error(`[STORAGE-ACCOUNTING-ERROR] Failed to update storage for ${parentUserId}: ${err?.message}`);
    }
  }

  /**
   * Fetch StorageUsage for parent with 3-tier ultra-fast caching:
   * 1. In-memory JS Map (30s) -> 0ms
   * 2. Redis cache (30s) -> <5ms
   * 3. Fresh Mongo StorageUsage doc (<60s) -> <10ms
   * 4. Full DB recalculation fallback
   */
  static async getStorageUsage(parentUserId: string, force: boolean = false): Promise<any | null> {
    if (!parentUserId) return null;

    const now = Date.now();
    const cacheKey = `${this.CACHE_PREFIX}${parentUserId}`;

    if (!force) {
      // Tier 1: In-memory cache
      const memHit = this.inMemoryCache.get(parentUserId);
      if (memHit && memHit.expiresAt > now) {
        return memHit.data;
      }

      // Tier 2: Redis cache
      const redisHit = await cacheService.get<any>(cacheKey);
      if (redisHit) {
        this.inMemoryCache.set(parentUserId, { data: redisHit, expiresAt: now + 30000 });
        return redisHit;
      }

      // Tier 3: Fresh Mongo StorageUsage doc (<60s)
      const existingDoc = await StorageUsage.findOne({ parentUserId }).lean();
      if (existingDoc && existingDoc.updatedAt) {
        const docAgeMs = now - new Date(existingDoc.updatedAt).getTime();
        if (docAgeMs < 60000) {
          this.inMemoryCache.set(parentUserId, { data: existingDoc, expiresAt: now + 30000 });
          await cacheService.set(cacheKey, existingDoc, this.CACHE_TTL_SEC);
          return existingDoc;
        }
      }
    }

    const usageDoc = await this.recalculateStorage(parentUserId);
    if (usageDoc) {
      this.inMemoryCache.set(parentUserId, { data: usageDoc, expiresAt: now + 30000 });
      await cacheService.set(cacheKey, usageDoc, this.CACHE_TTL_SEC);
    }
    return usageDoc;
  }
}
