import { Subscription } from '../models/Subscription';
import { StorageUsage } from '../models/StorageUsage';
import { User } from '../models/User';
import { MediaCapture } from '../models/MediaCapture';
import { CallRecording } from '../models/CallRecording';
import { LocationLog } from '../models/LocationLog';
import { CallLog } from '../models/CallLog';
import { BrowserHistory } from '../models/BrowserHistory';
import { Device } from '../models/Device';
import { ConfigService } from '../services/ConfigService';
import { StorageDeleteService } from '../services/StorageDeleteService';
import { StorageAccountingService } from '../services/StorageAccountingService';

export class SubscriptionJob {
  /**
   * Run Subscription Expiry & Grace State Machine (Paginating 10M safe scan)
   */
  static async processSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      const options = await ConfigService.getMergedOptions();

      // 1. Transition Active/Trial -> Grace when expireAt is reached
      const expiredSubs = await Subscription.find({
        status: { $in: ['active', 'trial'] },
        expireAt: { $lte: now },
      }).limit(500);

      for (const sub of expiredSubs) {
        const graceDays = sub.planSnapshot?.graceDays || options.graceDays || 3;
        sub.status = 'grace';
        sub.graceEndsAt = new Date(sub.expireAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
        await sub.save();

        console.log(`[SUBSCRIPTION-JOB] Transitioned parent ${sub.parentUserId} to GRACE state. Grace ends at: ${sub.graceEndsAt}`);
      }

      // 2. Transition Grace -> Expired when graceEndsAt is reached (Purge data + Stop monitoring)
      const postGraceSubs = await Subscription.find({
        status: 'grace',
        graceEndsAt: { $lte: now },
      }).limit(500);

      for (const sub of postGraceSubs) {
        sub.status = 'expired';
        await sub.save();

        console.warn(`[SUBSCRIPTION-JOB] Plan EXPIRED for parent ${sub.parentUserId}! Purging server data & signaling devices...`);

        // Find devices belonging to parent
        const devices = await Device.find({ parentUserId: sub.parentUserId }).select('deviceId');
        const deviceIds = devices.map((d) => d.deviceId);

        if (deviceIds.length > 0) {
          // Bulk delete media captures & call recordings
          await StorageDeleteService.deleteMediaCapturesBatch({ deviceId: { $in: deviceIds } });
          await LocationLog.deleteMany({ deviceId: { $in: deviceIds } });
          await CallLog.deleteMany({ deviceId: { $in: deviceIds } });
          await BrowserHistory.deleteMany({ deviceId: { $in: deviceIds } });
        }

        // Reset storage usage
        await StorageUsage.findOneAndUpdate(
          { parentUserId: sub.parentUserId },
          { totalBytes: 0, videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, perDevice: [] }
        );
      }
    } catch (err: any) {
      console.error(`[SUBSCRIPTION-JOB-ERROR] ${err?.message}`);
    }
  }

  /**
   * Run Auto-Delete Cron for parents who enabled Auto-Delete
   */
  static async processAutoDeleteSettings(): Promise<void> {
    try {
      const activeAutoDeleteUsers = await User.find({ autoDeleteIsEnabled: true }).limit(500);
      for (const u of activeAutoDeleteUsers) {
        await StorageDeleteService.executeParentAutoDeletePurge(u._id.toString());
      }
    } catch (err: any) {
      console.error(`[AUTO-DELETE-JOB-ERROR] ${err?.message}`);
    }
  }
}
