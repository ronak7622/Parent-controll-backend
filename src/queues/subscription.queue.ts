import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { Subscription } from '../models/Subscription';
import { StorageUsage } from '../models/StorageUsage';
import { Device } from '../models/Device';
import { MediaCapture } from '../models/MediaCapture';
import { CallRecording } from '../models/CallRecording';
import { CallLog } from '../models/CallLog';
import { BrowserHistory } from '../models/BrowserHistory';
import { YouTubeHistory } from '../models/YouTubeHistory';
import { YouTubeSession } from '../models/YouTubeSession';
import { AppSession } from '../models/AppSession';
import { ChildNotification } from '../models/ChildNotification';
import { LocationLog } from '../models/LocationLog';
import { DrivingTrip } from '../models/DrivingTrip';
import { KeyboardLog } from '../models/KeyboardLog';
import { WifiLog } from '../models/wifi-log.model';
import { InternetLog } from '../models/internet-log.model';
import { bulkDeleteMediaFromR2 } from '../services/r2.service';
import { sendFcmTopicNotification, sendFcmDataCommand } from '../services/fcm.service';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { ConfigService } from '../services/ConfigService';

let subscriptionQueue: Queue | null = null;
let subscriptionWorker: Worker | null = null;

const connection = {
  url: config.redisUri,
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
};

const processSubscriptionJobs = async () => {
  const now = new Date();
  const options: Record<string, any> = await ConfigService.getMergedOptions().catch(() => ({}));

  // -----------------------------------------------------------------
  // 1. ACTIVE -> GRACE TRANSITION
  // -----------------------------------------------------------------
  try {
    const expiredActiveSubs = await Subscription.find({
      status: 'active',
      expireAt: { $lte: now },
    });

    for (const sub of expiredActiveSubs) {
      const graceDays = sub.planSnapshot?.graceDays || options.graceDays || 3;
      sub.status = 'grace';
      sub.graceEndsAt = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
      await sub.save();

      console.log(`[SUBSCRIPTION-JOB] Parent ${sub.parentUserId} subscription moved to GRACE state (ends at ${sub.graceEndsAt})`);

      await sendFcmTopicNotification(
        `parent_${sub.parentUserId}`,
        'Subscription Expired — Grace Period Active',
        `Your plan has expired. You have ${graceDays} days grace period to renew before data cleanup.`,
        { type: 'subscription_grace', status: 'grace' }
      );
    }
  } catch (err: any) {
    console.error(`[SUBSCRIPTION-GRACE-SCAN-ERROR] ${err?.message}`);
  }

  // -----------------------------------------------------------------
  // 2. GRACE -> EXPIRED TRANSITION + DATA PURGE & MONITORING STOP
  // -----------------------------------------------------------------
  try {
    const expiredGraceSubs = await Subscription.find({
      status: 'grace',
      graceEndsAt: { $lte: now },
    });

    for (const sub of expiredGraceSubs) {
      sub.status = 'expired';
      await sub.save();

      const parentUserId = sub.parentUserId;
      console.log(`[SUBSCRIPTION-JOB] Parent ${parentUserId} GRACE ENDED. Executing post-grace data purge...`);

      const devices = await Device.find({ parentUserId });
      const deviceIds = devices.map((d) => d.deviceId).filter(Boolean);

      if (deviceIds.length > 0) {
        // Collect media URLs for R2 bulk delete
        const mediaCaptures = await MediaCapture.find({ deviceId: { $in: deviceIds } }).select('mediaUrl cdnUrl');
        const callRecordings = await CallRecording.find({ deviceId: { $in: deviceIds } }).select('audioUrl mediaUrl');

        const mediaUrls: string[] = [
          ...mediaCaptures.map((m: any) => m.mediaUrl || m.cdnUrl).filter(Boolean),
          ...callRecordings.map((c: any) => c.audioUrl || c.mediaUrl).filter(Boolean),
        ];

        // Purge Mongo documents for these devices
        await Promise.all([
          MediaCapture.deleteMany({ deviceId: { $in: deviceIds } }),
          CallRecording.deleteMany({ deviceId: { $in: deviceIds } }),
          CallLog.deleteMany({ deviceId: { $in: deviceIds } }),
          BrowserHistory.deleteMany({ deviceId: { $in: deviceIds } }),
          YouTubeHistory.deleteMany({ deviceId: { $in: deviceIds } }),
          YouTubeSession.deleteMany({ deviceId: { $in: deviceIds } }),
          AppSession.deleteMany({ deviceId: { $in: deviceIds } }),
          ChildNotification.deleteMany({ deviceId: { $in: deviceIds } }),
          LocationLog.deleteMany({ deviceId: { $in: deviceIds } }),
          DrivingTrip.deleteMany({ deviceId: { $in: deviceIds } }),
          KeyboardLog.deleteMany({ deviceId: { $in: deviceIds } }),
          WifiLog.deleteMany({ deviceId: { $in: deviceIds } }),
          InternetLog.deleteMany({ deviceId: { $in: deviceIds } }),
        ]);

        // R2 bulk delete
        if (mediaUrls.length > 0) {
          await bulkDeleteMediaFromR2(mediaUrls);
        }

        // Send FCM command to child devices to delete local data & stop background monitoring
        for (const devId of deviceIds) {
          await sendFcmDataCommand(devId, 'COMMAND_WIPE_LOCAL_DATA', {
            action: 'stop_monitoring',
            reason: 'subscription_expired',
          });
        }
      }

      // Reset StorageUsage counter
      await StorageUsage.findOneAndUpdate(
        { parentUserId },
        { totalBytes: 0, videoBytes: 0, audioBytes: 0, photoBytes: 0, textBytes: 0, perDevice: [] },
        { upsert: true }
      );

      await sendFcmTopicNotification(
        `parent_${parentUserId}`,
        'Account Expired & Storage Reset',
        'Your subscription grace period has ended. Local and cloud storage data has been cleaned up.',
        { type: 'subscription_expired', status: 'expired' }
      );
    }
  } catch (err: any) {
    console.error(`[SUBSCRIPTION-PURGE-SCAN-ERROR] ${err?.message}`);
  }

  // -----------------------------------------------------------------
  // 3. SCHEDULED BATCH FCM NOTIFICATIONS (Storage Warn % & Expiry)
  // -----------------------------------------------------------------
  try {
    const activeSubs = await Subscription.find({ status: { $in: ['active', 'trial', 'grace'] } });

    for (const sub of activeSubs) {
      const parentUserId = sub.parentUserId;
      const allowedBytes = sub.planSnapshot?.storageBytes || 10737418240;
      const warnPercent = options.storageWarnPercent || sub.planSnapshot?.storageWarnPercent || 80;

      const usage = await StorageAccountingService.getStorageUsage(parentUserId);
      const totalBytes = usage?.totalBytes || 0;
      const percent = allowedBytes > 0 ? (totalBytes / allowedBytes) * 100 : 0;

      if (percent >= 100) {
        await sendFcmTopicNotification(
          `parent_${parentUserId}`,
          'Storage Quota 100% Full',
          'Your cloud storage space is full. Media uploads are currently paused.',
          { type: 'storage_full', percent: percent.toFixed(1) }
        );
      } else if (percent >= warnPercent) {
        await sendFcmTopicNotification(
          `parent_${parentUserId}`,
          `Storage ${percent.toFixed(0)}% Full Warning`,
          `Your storage has reached ${percent.toFixed(0)}% of your allowed plan quota.`,
          { type: 'storage_warning', percent: percent.toFixed(1) }
        );
      }

      // Expiry Warning (7, 3, 1 days before expireAt)
      if (sub.expireAt) {
        const diffMs = sub.expireAt.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 7 || diffDays === 3 || diffDays === 1) {
          await sendFcmTopicNotification(
            `parent_${parentUserId}`,
            `Subscription Expiring in ${diffDays} Day${diffDays > 1 ? 's' : ''}`,
            `Your subscription plan expires on ${sub.expireAt.toLocaleDateString()}. Renew now to avoid interruption.`,
            { type: 'expiry_warning', daysRemaining: String(diffDays) }
          );
        }
      }
    }
  } catch (err: any) {
    console.error(`[SUBSCRIPTION-NOTIF-SCAN-ERROR] ${err?.message}`);
  }
};

export const initSubscriptionQueue = () => {
  if (!config.redisUri) {
    console.warn('[SUBSCRIPTION-QUEUE-WARN] REDIS_URI not configured. Subscription BullMQ jobs disabled.');
    return;
  }

  try {
    subscriptionQueue = new Queue('subscription-scan', { connection });
    subscriptionWorker = new Worker(
      'subscription-scan',
      async (job: Job) => {
        console.log(`[SUBSCRIPTION-QUEUE] Running scheduled job: ${job.name}`);
        await processSubscriptionJobs();
      },
      { connection }
    );

    subscriptionWorker.on('completed', (job: Job) => {
      console.log(`[SUBSCRIPTION-QUEUE] Job ${job.id} completed successfully`);
    });

    subscriptionWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[SUBSCRIPTION-QUEUE] Job ${job?.id} failed:`, err.message);
    });

    // Schedule repeatable job every 1 hour (3600000 ms)
    (subscriptionQueue.add as any)(
      'hourly-subscription-scan',
      {},
      {
        repeat: { every: 3600000 },
        jobId: 'repeatable-hourly-subscription-scan',
      }
    );

    console.log('[SUBSCRIPTION-QUEUE] Subscription & Notification BullMQ Queue initialized with hourly repeatable scan.');
  } catch (err: any) {
    console.warn('[SUBSCRIPTION-QUEUE-ERROR] Failed to initialize subscription queue:', err.message);
  }
};
