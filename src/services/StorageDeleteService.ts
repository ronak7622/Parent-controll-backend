import { MediaCapture } from '../models/MediaCapture';
import { Recording } from '../models/Recording';
import { CallRecording } from '../models/CallRecording';
import { LocationLog } from '../models/LocationLog';
import { CallLog } from '../models/CallLog';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { AppUsage } from '../models/AppUsage';
import { AppSession } from '../models/AppSession';
import { ChildNotification } from '../models/ChildNotification';
import { ChildMessage } from '../models/ChildMessage';
import { KeyboardLog } from '../models/KeyboardLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { WifiLog } from '../models/wifi-log.model';
import { InternetLog } from '../models/internet-log.model';
import { ChatMessage } from '../models/ChatMessage';
import { Contact } from '../models/Contact';
import { AppBlockRule } from '../models/AppBlockRule';
import { AppLimit } from '../models/AppLimit';
import { ScheduleConfig } from '../models/ScheduleConfig';
import { DeletedRecording } from '../models/DeletedRecording';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { LiveUsage } from '../models/LiveUsage';
import { StorageUsage } from '../models/StorageUsage';
import { deleteMediaFromR2, bulkDeleteMediaFromR2 } from './r2.service';
import { StorageAccountingService } from './StorageAccountingService';

export class StorageDeleteService {
  /**
   * Delete single MediaCapture record + R2 file + decrement counter
   */
  static async deleteMediaCapture(id: string): Promise<boolean> {
    try {
      const doc = await MediaCapture.findById(id);
      if (!doc) return false;

      const deviceId = doc.deviceId;
      const mediaUrl = doc.mediaUrl || (doc as any).cdnUrl || '';
      const bytes = doc.fileSizeBytes || 50000;
      const type = doc.type || 'screenshot';

      const category = type.includes('video')
        ? 'video'
        : type.includes('audio')
        ? 'audio'
        : 'photo';

      const parentUserId = await StorageAccountingService.resolveParentUserId(deviceId);

      await MediaCapture.findByIdAndDelete(id);

      if (mediaUrl) {
        await deleteMediaFromR2(mediaUrl);
      }

      if (parentUserId) {
        await StorageAccountingService.updateStorage(parentUserId, deviceId, category, -Math.abs(bytes));
      }

      return true;
    } catch (err: any) {
      console.error(`[STORAGE-DELETE-MEDIA-ERROR] ${err?.message}`);
      return false;
    }
  }

  /**
   * Bulk delete MediaCaptures (by IDs or filter) + R2 bulk delete + decrement counter
   */
  static async deleteMediaCapturesBatch(filter: Record<string, any>): Promise<number> {
    try {
      const docs = await MediaCapture.find(filter);
      if (docs.length === 0) return 0;

      const mediaUrls = docs.map((d: any) => d.mediaUrl || d.cdnUrl || '').filter(Boolean);
      const totalBytes = docs.reduce((acc, d) => acc + (d.fileSizeBytes || 50000), 0);

      const sampleDoc = docs[0];
      const deviceId = sampleDoc.deviceId;
      const category = (sampleDoc.type || '').includes('video')
        ? 'video'
        : (sampleDoc.type || '').includes('audio')
        ? 'audio'
        : 'photo';

      const parentUserId = await StorageAccountingService.resolveParentUserId(deviceId);

      await MediaCapture.deleteMany({ _id: { $in: docs.map((d) => d._id) } });

      if (mediaUrls.length > 0) {
        await bulkDeleteMediaFromR2(mediaUrls);
      }

      if (parentUserId) {
        await StorageAccountingService.updateStorage(parentUserId, deviceId, category, -Math.abs(totalBytes));
      }

      return docs.length;
    } catch (err: any) {
      console.error(`[STORAGE-DELETE-BATCH-ERROR] ${err?.message}`);
      return 0;
    }
  }

  /**
   * Delete single CallRecording record + R2 file + decrement counter
   */
  static async deleteCallRecording(id: string): Promise<boolean> {
    try {
      const doc = await CallRecording.findById(id);
      if (!doc) return false;

      const deviceId = doc.deviceId;
      const mediaUrl = (doc as any).mediaUrl || (doc as any).audioUrl || '';
      const bytes = (doc as any).fileSizeBytes || 100000;

      const parentUserId = await StorageAccountingService.resolveParentUserId(deviceId);

      await CallRecording.findByIdAndDelete(id);

      if (mediaUrl) {
        await deleteMediaFromR2(mediaUrl);
      }

      if (parentUserId) {
        await StorageAccountingService.updateStorage(parentUserId, deviceId, 'audio', -Math.abs(bytes));
      }

      return true;
    } catch (err: any) {
      console.error(`[STORAGE-DELETE-CALL-REC-ERROR] ${err?.message}`);
      return false;
    }
  }

  /**
   * Decrement textBytes counter when text/log records (SMS, Calls, Browsing, Location, Notifications) are deleted
   */
  static async deleteTextHistoryBatch(deviceId: string, count: number, bytesPerRecord: number = 500): Promise<void> {
    try {
      if (count <= 0) return;
      const parentUserId = await StorageAccountingService.resolveParentUserId(deviceId);
      if (!parentUserId) return;
      const totalBytes = count * bytesPerRecord;
      await StorageAccountingService.updateStorage(parentUserId, deviceId, 'text', -Math.abs(totalBytes));
    } catch (err: any) {
      console.error(`[STORAGE-DELETE-TEXT-BATCH-ERROR] ${err?.message}`);
    }
  }

  /**
   * Execute auto-delete purge for a specific parent user and their devices
   * Supports independent per-device retention periods and categories
   * Purges ALL media, audio, video, and 13 database text log collections across R2 & local disk
   */
  static async executeParentAutoDeletePurge(parentUserId: string, specificDeviceId?: string): Promise<void> {
    try {
      const user = await User.findById(parentUserId);
      if (!user) return;

      const deviceQuery: Record<string, any> = { parentUserId: user._id };
      if (specificDeviceId) {
        deviceQuery.deviceId = specificDeviceId;
      }
      const devices = await Device.find(deviceQuery);
      if (devices.length === 0) return;

      let anyPurged = false;

      for (const dev of devices) {
        // Device-specific settings with user-level fallback
        const isDevEnabled = dev.autoDeleteIsEnabled !== undefined ? dev.autoDeleteIsEnabled : (user.autoDeleteIsEnabled ?? false);
        if (!isDevEnabled) continue;

        const retentionMinutes = dev.autoDeleteMinutes || (dev.autoDeleteDays ? dev.autoDeleteDays * 1440 : (user.autoDeleteMinutes || (user.autoDeleteDays ? user.autoDeleteDays * 1440 : 10080)));
        const cutoffDate = new Date(Date.now() - retentionMinutes * 60 * 1000);
        const categories = (dev.autoDeleteCategories && dev.autoDeleteCategories.length > 0) ? dev.autoDeleteCategories : (user.autoDeleteCategories || ['all']);
        const isAll = categories.includes('all');
        const devId = dev.deviceId;

        const dateQuery = {
          $or: [
            { createdAt: { $lte: cutoffDate } },
            { timestamp: { $lte: cutoffDate } },
            { startedAt: { $lte: cutoffDate } },
            { startTime: { $lte: cutoffDate } },
            { date: { $lte: cutoffDate } },
          ],
        };

        const mediaUrlsToDelete: string[] = [];

        // 1. Photos & Screenshots (MediaCapture)
        if (isAll || categories.includes('photos')) {
          const photoDocs = await MediaCapture.find({
            deviceId: devId,
            type: { $in: ['screenshot', 'front_photo', 'back_photo', 'photo', 'manual_photo'] },
            ...dateQuery,
          }).select('_id mediaUrl cdnUrl thumbnailUrl');

          for (const doc of photoDocs) {
            if (doc.mediaUrl) mediaUrlsToDelete.push(doc.mediaUrl);
            if ((doc as any).cdnUrl) mediaUrlsToDelete.push((doc as any).cdnUrl);
            if (doc.thumbnailUrl) mediaUrlsToDelete.push(doc.thumbnailUrl);
          }

          if (photoDocs.length > 0) {
            await MediaCapture.deleteMany({ _id: { $in: photoDocs.map((d) => d._id) } });
          }
        }

        // 2. Videos & Screen Recordings (MediaCapture + Recording)
        if (isAll || categories.includes('videos')) {
          const videoMediaDocs = await MediaCapture.find({
            deviceId: devId,
            type: { $in: ['video', 'screen_recording', 'manual_video'] },
            ...dateQuery,
          }).select('_id mediaUrl cdnUrl thumbnailUrl');

          for (const doc of videoMediaDocs) {
            if (doc.mediaUrl) mediaUrlsToDelete.push(doc.mediaUrl);
            if ((doc as any).cdnUrl) mediaUrlsToDelete.push((doc as any).cdnUrl);
            if (doc.thumbnailUrl) mediaUrlsToDelete.push(doc.thumbnailUrl);
          }

          if (videoMediaDocs.length > 0) {
            await MediaCapture.deleteMany({ _id: { $in: videoMediaDocs.map((d) => d._id) } });
          }

          const videoRecordings = await Recording.find({
            deviceId: devId,
            recordingType: { $in: ['video', 'screen'] },
            ...dateQuery,
          }).select('_id mediaUrl thumbnailUrl');

          for (const rec of videoRecordings) {
            if (rec.mediaUrl) mediaUrlsToDelete.push(rec.mediaUrl);
            if (rec.thumbnailUrl) mediaUrlsToDelete.push(rec.thumbnailUrl);
          }

          if (videoRecordings.length > 0) {
            await Recording.deleteMany({ _id: { $in: videoRecordings.map((r) => r._id) } });
          }
        }

        // 3. Audio & Voice Recordings (CallRecording + Recording)
        if (isAll || categories.includes('audio') || categories.includes('recordings')) {
          const callRecordings = await CallRecording.find({
            deviceId: devId,
            ...dateQuery,
          }).select('_id audioUrl mediaUrl');

          for (const rec of callRecordings) {
            if (rec.audioUrl) mediaUrlsToDelete.push(rec.audioUrl);
            if ((rec as any).mediaUrl) mediaUrlsToDelete.push((rec as any).mediaUrl);
          }

          if (callRecordings.length > 0) {
            await CallRecording.deleteMany({ _id: { $in: callRecordings.map((r) => r._id) } });
          }

          const audioRecordings = await Recording.find({
            deviceId: devId,
            recordingType: 'audio',
            ...dateQuery,
          }).select('_id mediaUrl thumbnailUrl');

          for (const rec of audioRecordings) {
            if (rec.mediaUrl) mediaUrlsToDelete.push(rec.mediaUrl);
            if (rec.thumbnailUrl) mediaUrlsToDelete.push(rec.thumbnailUrl);
          }

          if (audioRecordings.length > 0) {
            await Recording.deleteMany({ _id: { $in: audioRecordings.map((r) => r._id) } });
          }
        }

        // 4. Bulk purge R2 cloud files & local disk uploads
        if (mediaUrlsToDelete.length > 0) {
          const uniqueUrls = Array.from(new Set(mediaUrlsToDelete));
          await bulkDeleteMediaFromR2(uniqueUrls);
          console.log(`[AUTO-DELETE-PURGE] Deleted ${uniqueUrls.length} media files from R2/disk for device ${devId} (parent ${parentUserId})`);
        }

        // 5. Database Logs & Text Records (13 Collections)
        const logFilter = {
          deviceId: devId,
          ...dateQuery,
        };

        if (isAll || categories.includes('text') || categories.includes('audio')) {
          await CallLog.deleteMany(logFilter);
        }

        if (isAll || categories.includes('text')) {
          await Promise.all([
            LocationLog.deleteMany(logFilter),
            ChildMessage.deleteMany(logFilter),
            ChildNotification.deleteMany(logFilter),
            BrowserHistory.deleteMany(logFilter),
            YouTubeHistory.deleteMany(logFilter),
            YouTubeSession.deleteMany(logFilter),
            AppSession.deleteMany(logFilter),
            AppUsage.deleteMany(logFilter),
            DrivingTrip.deleteMany(logFilter),
            KeyboardLog.deleteMany(logFilter),
            WifiLog.deleteMany(logFilter),
            InternetLog.deleteMany(logFilter),
          ]);
        }

        // 5b. Social Chat History (WhatsApp, Instagram, Snapchat, Messenger)
        if (isAll || categories.includes('chat') || categories.includes('social_chat')) {
          const chatRes = await ChatMessage.deleteMany(logFilter);
          if (chatRes.deletedCount > 0) {
            console.log(`[AUTO-DELETE-PURGE] Purged ${chatRes.deletedCount} chat messages for device ${devId}`);
          }
        }

        anyPurged = true;
        const devDisplayName = dev.deviceName || dev.deviceModel || dev.deviceId;
        console.log(`[AUTO-DELETE-PURGE] Device ${devId} (${devDisplayName}) purge completed. Retention: ${retentionMinutes} mins, Categories: ${categories.join(', ')}`);
      }

      // 6. Recalculate storage usage statistics for user if any purge executed
      if (anyPurged) {
        await StorageAccountingService.recalculateStorage(parentUserId);
      }
    } catch (err: any) {
      console.error(`[AUTO-DELETE-PURGE-ERROR] ${err?.message}`);
    }
  }

  /**
   * Erase ALL stored data for a specific device (Media in R2 + All Text/Log records in Mongo)
   * Decrements/zeros device storage and recalculates parent account storage.
   * DOES NOT unpair or disconnect the device.
   */
  static async eraseAllDeviceData(deviceId: string, parentUserId?: string, wipeParentScoped: boolean = false): Promise<{ freedBytes: number; deletedCount: number }> {
    try {
      if (!parentUserId) {
        parentUserId = (await StorageAccountingService.resolveParentUserId(deviceId)) || undefined;
      }

      const mediaUrlsToDelete: string[] = [];
      let totalBytesFreed = 0;
      let totalDeletedCount = 0;

      // 1. MediaCapture (Photos, Screenshots, Videos, Audio)
      try {
        const mediaDocs = await MediaCapture.find({ deviceId }).select('_id mediaUrl cdnUrl thumbnailUrl fileSizeBytes type');
        for (const doc of mediaDocs) {
          if (doc.mediaUrl) mediaUrlsToDelete.push(doc.mediaUrl);
          if ((doc as any).cdnUrl) mediaUrlsToDelete.push((doc as any).cdnUrl);
          if (doc.thumbnailUrl) mediaUrlsToDelete.push(doc.thumbnailUrl);
          totalBytesFreed += doc.fileSizeBytes || 50000;
        }
        if (mediaDocs.length > 0) {
          await MediaCapture.deleteMany({ deviceId });
          totalDeletedCount += mediaDocs.length;
        }
      } catch (err: any) {
        console.warn(`[ERASE-ALL-DEVICE-DATA] Error querying/deleting MediaCapture for ${deviceId}:`, err?.message);
      }

      // 2. Recording (Videos, Screen recordings, Audio)
      try {
        const recordingDocs = await Recording.find({ deviceId }).select('_id mediaUrl thumbnailUrl fileSizeBytes');
        for (const rec of recordingDocs) {
          if (rec.mediaUrl) mediaUrlsToDelete.push(rec.mediaUrl);
          if (rec.thumbnailUrl) mediaUrlsToDelete.push(rec.thumbnailUrl);
          totalBytesFreed += (rec as any).fileSizeBytes || 150000;
        }
        if (recordingDocs.length > 0) {
          await Recording.deleteMany({ deviceId });
          totalDeletedCount += recordingDocs.length;
        }
      } catch (err: any) {
        console.warn(`[ERASE-ALL-DEVICE-DATA] Error querying/deleting Recording for ${deviceId}:`, err?.message);
      }

      // 3. CallRecording (Call Audio)
      try {
        const callRecDocs = await CallRecording.find({ deviceId }).select('_id audioUrl mediaUrl fileSizeBytes');
        for (const rec of callRecDocs) {
          if (rec.audioUrl) mediaUrlsToDelete.push(rec.audioUrl);
          if ((rec as any).mediaUrl) mediaUrlsToDelete.push((rec as any).mediaUrl);
          totalBytesFreed += (rec as any).fileSizeBytes || 100000;
        }
        if (callRecDocs.length > 0) {
          await CallRecording.deleteMany({ deviceId });
          totalDeletedCount += callRecDocs.length;
        }
      } catch (err: any) {
        console.warn(`[ERASE-ALL-DEVICE-DATA] Error querying/deleting CallRecording for ${deviceId}:`, err?.message);
      }

      // 4. Bulk Delete all R2 & local files
      if (mediaUrlsToDelete.length > 0) {
        try {
          const uniqueUrls = Array.from(new Set(mediaUrlsToDelete));
          await bulkDeleteMediaFromR2(uniqueUrls);
        } catch (err: any) {
          console.warn(`[ERASE-ALL-DEVICE-DATA] Error deleting R2 files for ${deviceId}:`, err?.message);
        }
      }

      // 5. Delete all Text / Database Logs (19 Collections) - wrapped safe
      const textCollections: Array<{ name: string; promise: Promise<any> }> = [
        { name: 'CallLog', promise: CallLog.deleteMany({ deviceId }) },
        { name: 'LocationLog', promise: LocationLog.deleteMany({ deviceId }) },
        { name: 'ChildMessage', promise: ChildMessage.deleteMany({ deviceId }) },
        { name: 'ChildNotification', promise: ChildNotification.deleteMany({ deviceId }) },
        { name: 'BrowserHistory', promise: BrowserHistory.deleteMany({ deviceId }) },
        { name: 'YouTubeHistory', promise: YouTubeHistory.deleteMany({ deviceId }) },
        { name: 'YouTubeSession', promise: YouTubeSession.deleteMany({ deviceId }) },
        { name: 'AppSession', promise: AppSession.deleteMany({ deviceId }) },
        { name: 'AppUsage', promise: AppUsage.deleteMany({ deviceId }) },
        { name: 'DrivingTrip', promise: DrivingTrip.deleteMany({ deviceId }) },
        { name: 'KeyboardLog', promise: KeyboardLog.deleteMany({ deviceId }) },
        { name: 'WifiLog', promise: WifiLog.deleteMany({ deviceId }) },
        { name: 'InternetLog', promise: InternetLog.deleteMany({ deviceId }) },
        { name: 'ChatMessage', promise: ChatMessage.deleteMany({ deviceId }) },
        { name: 'Contact', promise: Contact.deleteMany({ deviceId }) },
        { name: 'AppBlockRule', promise: AppBlockRule.deleteMany({ deviceId }) },
        { name: 'AppLimit', promise: AppLimit.deleteMany({ deviceId }) },
        { name: 'ScheduleConfig', promise: ScheduleConfig.deleteMany({ deviceId }) },
        { name: 'DeletedRecording', promise: DeletedRecording.deleteMany({ deviceId }) },
      ];

      const settled = await Promise.allSettled(textCollections.map((c) => c.promise));
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          const deleted = (res.value as any)?.deletedCount || 0;
          totalDeletedCount += deleted;
          totalBytesFreed += deleted * 500; // estimated 500 bytes per text log
        } else {
          console.warn(`[ERASE-ALL-DEVICE-DATA] Error deleting ${textCollections[idx].name} for ${deviceId}:`, res.reason?.message);
        }
      });

      // 6. Recalculate or Wipe Parent Account Storage / LiveUsage
      if (parentUserId) {
        let shouldWipeParent = wipeParentScoped;
        if (!shouldWipeParent) {
          const otherDevices = await Device.countDocuments({ parentUserId, deviceId: { $ne: deviceId } }).catch(() => 0);
          if (otherDevices === 0) shouldWipeParent = true;
        }

        if (shouldWipeParent) {
          try {
            await LiveUsage.deleteMany({ parentUserId });
          } catch (e: any) {
            console.warn(`[ERASE-ALL-DEVICE-DATA] Error wiping LiveUsage for parent ${parentUserId}:`, e?.message);
          }
          try {
            await StorageUsage.deleteMany({ parentUserId });
          } catch (e: any) {
            console.warn(`[ERASE-ALL-DEVICE-DATA] Error wiping StorageUsage for parent ${parentUserId}:`, e?.message);
          }
          await StorageAccountingService.invalidateCache(parentUserId);
        } else {
          await StorageAccountingService.recalculateStorage(parentUserId);
        }
      }

      console.log(`[ERASE-ALL-DEVICE-DATA] Device ${deviceId}: ${totalDeletedCount} records deleted, ${totalBytesFreed} bytes freed. Device remains active.`);
      return { freedBytes: totalBytesFreed, deletedCount: totalDeletedCount };
    } catch (err: any) {
      console.error(`[ERASE-ALL-DEVICE-DATA-ERROR] ${err?.message}`);
      throw err;
    }
  }

  /**
   * Trims the oldest excess data across all child devices belonging to parentUserId
   * until the total stored bytes is <= targetBytes.
   * Cleans R2 files and recalculates storage via StorageAccountingService.
   * Preserves all Device, Order, and config records.
   */
  static async trimOldestExcessStorage(parentUserId: string, targetBytes: number): Promise<{ freedBytes: number; deletedCount: number }> {
    try {
      const usage = await StorageAccountingService.getStorageUsage(parentUserId);
      const currentBytes = usage?.totalBytes || 0;
      if (currentBytes <= targetBytes) {
        console.log(`[STORAGE-TRIM] Current bytes (${currentBytes}) is already within target (${targetBytes}) for parent ${parentUserId}`);
        return { freedBytes: 0, deletedCount: 0 };
      }

      const bytesToFree = currentBytes - targetBytes;
      console.log(`[STORAGE-TRIM] Starting excess data trim for parent ${parentUserId}. Need to free ~${(bytesToFree / (1024 * 1024)).toFixed(2)} MB to reach ${(targetBytes / (1024 * 1024)).toFixed(2)} MB target`);

      const devices = await Device.find({ parentUserId }).select('deviceId');
      const deviceIds = devices.map((d) => d.deviceId);
      if (deviceIds.length === 0) {
        return { freedBytes: 0, deletedCount: 0 };
      }

      let totalFreed = 0;
      let totalDeleted = 0;
      const mediaUrlsToDelete: string[] = [];

      // 1. Fetch oldest MediaCaptures
      const mediaCaptures = await MediaCapture.find({ deviceId: { $in: deviceIds } })
        .sort({ createdAt: 1 })
        .select('_id deviceId fileSizeBytes mediaUrl cdnUrl thumbnailUrl createdAt')
        .limit(2000);

      // 2. Fetch oldest Recordings
      const recordings = await Recording.find({ deviceId: { $in: deviceIds } })
        .sort({ createdAt: 1 })
        .select('_id deviceId fileSizeBytes mediaUrl thumbnailUrl createdAt')
        .limit(2000);

      // 3. Fetch oldest CallRecordings
      const callRecordings = await CallRecording.find({ deviceId: { $in: deviceIds } })
        .sort({ createdAt: 1 })
        .select('_id deviceId fileSizeBytes audioUrl mediaUrl createdAt')
        .limit(2000);

      // Combine and sort by createdAt ASC so truly oldest records are deleted first
      type MediaItem = {
        model: 'MediaCapture' | 'Recording' | 'CallRecording';
        id: any;
        bytes: number;
        urls: string[];
        createdAt: Date;
      };

      const allMedia: MediaItem[] = [];

      for (const m of mediaCaptures) {
        const urls: string[] = [];
        if (m.mediaUrl) urls.push(m.mediaUrl);
        if ((m as any).cdnUrl) urls.push((m as any).cdnUrl);
        if (m.thumbnailUrl) urls.push(m.thumbnailUrl);
        allMedia.push({
          model: 'MediaCapture',
          id: m._id,
          bytes: m.fileSizeBytes || 50000,
          urls,
          createdAt: (m as any).createdAt || (m as any).timestamp || new Date(0),
        });
      }

      for (const r of recordings) {
        const urls: string[] = [];
        if (r.mediaUrl) urls.push(r.mediaUrl);
        if (r.thumbnailUrl) urls.push(r.thumbnailUrl);
        allMedia.push({
          model: 'Recording',
          id: r._id,
          bytes: (r as any).fileSizeBytes || 150000,
          urls,
          createdAt: (r as any).createdAt || new Date(0),
        });
      }

      for (const c of callRecordings) {
        const urls: string[] = [];
        if (c.audioUrl) urls.push(c.audioUrl);
        if ((c as any).mediaUrl) urls.push((c as any).mediaUrl);
        allMedia.push({
          model: 'CallRecording',
          id: c._id,
          bytes: (c as any).fileSizeBytes || 100000,
          urls,
          createdAt: (c as any).createdAt || new Date(0),
        });
      }

      allMedia.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const mediaCapIdsToDelete: any[] = [];
      const recIdsToDelete: any[] = [];
      const callRecIdsToDelete: any[] = [];

      for (const item of allMedia) {
        if (totalFreed >= bytesToFree) break;

        if (item.model === 'MediaCapture') mediaCapIdsToDelete.push(item.id);
        else if (item.model === 'Recording') recIdsToDelete.push(item.id);
        else if (item.model === 'CallRecording') callRecIdsToDelete.push(item.id);

        mediaUrlsToDelete.push(...item.urls);
        totalFreed += item.bytes;
        totalDeleted += 1;
      }

      // Execute bulk deletes for media
      if (mediaCapIdsToDelete.length > 0) {
        await MediaCapture.deleteMany({ _id: { $in: mediaCapIdsToDelete } });
      }
      if (recIdsToDelete.length > 0) {
        await Recording.deleteMany({ _id: { $in: recIdsToDelete } });
      }
      if (callRecIdsToDelete.length > 0) {
        await CallRecording.deleteMany({ _id: { $in: callRecIdsToDelete } });
      }

      if (mediaUrlsToDelete.length > 0) {
        const uniqueUrls = Array.from(new Set(mediaUrlsToDelete));
        await bulkDeleteMediaFromR2(uniqueUrls);
      }

      // If still need to free bytes, trim oldest text logs
      if (totalFreed < bytesToFree) {
        const logCollections = [
          LocationLog,
          ChildNotification,
          BrowserHistory,
          ChatMessage,
          CallLog,
          YouTubeHistory,
        ];

        for (const col of logCollections) {
          if (totalFreed >= bytesToFree) break;
          const oldestDocs = await (col as any).find({ deviceId: { $in: deviceIds } })
            .sort({ createdAt: 1, timestamp: 1 })
            .limit(500)
            .select('_id');
          if (oldestDocs.length > 0) {
            await (col as any).deleteMany({ _id: { $in: oldestDocs.map((d: any) => d._id) } });
            const freed = oldestDocs.length * 500;
            totalFreed += freed;
            totalDeleted += oldestDocs.length;
          }
        }
      }

      // Recalculate storage for parent user
      await StorageAccountingService.recalculateStorage(parentUserId);

      console.log(`[STORAGE-TRIM-SUCCESS] Trimmed ${totalDeleted} oldest records, freed ~${(totalFreed / (1024 * 1024)).toFixed(2)} MB for parent ${parentUserId}`);
      return { freedBytes: totalFreed, deletedCount: totalDeleted };
    } catch (err: any) {
      console.error(`[STORAGE-TRIM-ERROR] ${err?.message}`);
      return { freedBytes: 0, deletedCount: 0 };
    }
  }
}
