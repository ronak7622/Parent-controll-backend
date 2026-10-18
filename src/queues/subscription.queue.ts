import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { Subscription } from '../models/Subscription';
import { sendFcmTopicNotification, sendLocalizedFcmTopicNotification } from '../services/fcm.service';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { ConfigService } from '../services/ConfigService';
import { SubscriptionJob } from '../jobs/SubscriptionJob';

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
  // 1. UNIFIED SUBSCRIPTION LIFECYCLE (Active, Trial, Queued, Grace, Expired & Wipe)
  // Single source of truth in SubscriptionJob.processSubscriptionLifecycle()
  // -----------------------------------------------------------------
  try {
    await SubscriptionJob.processSubscriptionLifecycle();
  } catch (err: any) {
    console.error(`[SUBSCRIPTION-LIFECYCLE-SCAN-ERROR] ${err?.message}`);
  }

  // -----------------------------------------------------------------
  // 2. SCHEDULED BATCH FCM NOTIFICATIONS (Expiring Soon & Storage Alerts)
  // Ensures notifications arrive even when parent app is killed / closed!
  // -----------------------------------------------------------------
  try {
    const activeSubs = await Subscription.find({ status: { $in: ['active', 'trial'] } });

    for (const sub of activeSubs) {
      const parentUserId = sub.parentUserId;

      // ─── A. EXPIRING SOON FCM NOTIFICATION (Minutes & Interval from Remote Config) ───
      if (sub.expireAt && sub.expireAt.getTime() > now.getTime()) {
        const isTrial = sub.isTrial || sub.planSnapshot?.type === 'trial';
        const remainingMinutes = Math.round((sub.expireAt.getTime() - now.getTime()) / (60 * 1000));

        const beforeMinutes = isTrial
          ? (options.trialExpringSoonWarNotificationBeforeTimeInMinute || 240)
          : (options.expringSoonWarNotificationBeforeTimeInMinute || 4320);

        const intervalMinutes = isTrial
          ? (options.trialExpringSoonWarNotificationIntervalInMinute || 120)
          : (options.expringSoonWarNotificationIntervalInMinute || 1440);

        if (remainingMinutes <= beforeMinutes) {
          const lastExpireNotif = sub.lastExpireWarnNotificationAt ? new Date(sub.lastExpireWarnNotificationAt).getTime() : 0;
          if (now.getTime() - lastExpireNotif >= intervalMinutes * 60 * 1000) {
            const days = Math.floor(remainingMinutes / 1440);
            const hours = Math.floor((remainingMinutes % 1440) / 60);
            const mins = remainingMinutes % 60;
            const timeText = days > 0
              ? `${days} Day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} Hr${hours > 1 ? 's' : ''}` : ''}`
              : hours > 0
                ? `${hours} Hr${hours > 1 ? 's' : ''}${mins > 0 ? ` ${mins} Min${mins > 1 ? 's' : ''}` : ''}`
                : `${mins} Min${mins > 1 ? 's' : ''}`;

            const templateKey = isTrial ? 'TRIAL_EXPIRING_SOON' : 'PLAN_EXPIRING_SOON';
            const templateParams: Record<string, string | number> = isTrial
              ? { hours: Math.max(1, Math.ceil(remainingMinutes / 60)) }
              : { days: Math.max(1, Math.ceil(remainingMinutes / 1440)), deviceName: 'your devices' };

            await sendLocalizedFcmTopicNotification(
              `parent_${parentUserId}`,
              templateKey,
              templateParams,
              undefined,
              {
                type: 'expiring_soon',
                isTrial: String(isTrial),
                remainingMinutes: String(remainingMinutes),
              }
            );

            sub.lastExpireWarnNotificationAt = now;
            await sub.save();
            console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Expiring Soon FCM to parent_${parentUserId} (${timeText} left)`);
          }
        }
      }

      // ─── B. STORAGE USAGE FCM NOTIFICATION (Warn % & 100% Full with Interval) ───
      const allowedBytes = sub.planSnapshot?.storageBytes || 10737418240;
      const warnPercent = options.storageWarnNotificationPercent || options.storageWarnPercent || sub.planSnapshot?.storageWarnPercent || 80;
      const storageIntervalMin = options.storageWarnNotificationIntervalInMinute || options.storageWarnNotificationIntervalMin || 120;

      const usage = await StorageAccountingService.getStorageUsage(parentUserId);
      const totalBytes = usage?.totalBytes || 0;
      const percent = allowedBytes > 0 ? (totalBytes / allowedBytes) * 100 : 0;

      const lastStorageNotif = sub.lastStorageWarnNotificationAt ? new Date(sub.lastStorageWarnNotificationAt).getTime() : 0;
      const canSendStorageNotif = (now.getTime() - lastStorageNotif) >= storageIntervalMin * 60 * 1000;

      if (canSendStorageNotif) {
        if (percent >= 100) {
          await sendLocalizedFcmTopicNotification(
            `parent_${parentUserId}`,
            'STORAGE_FULL',
            {},
            undefined,
            { type: 'storage_full', percent: percent.toFixed(1) }
          );
          sub.lastStorageWarnNotificationAt = now;
          await sub.save();
          console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Storage 100% Full FCM to parent_${parentUserId}`);
        } else if (percent >= warnPercent) {
          await sendLocalizedFcmTopicNotification(
            `parent_${parentUserId}`,
            'STORAGE_WARNING',
            { percent: percent.toFixed(1) },
            undefined,
            { type: 'storage_warning', percent: percent.toFixed(1) }
          );
          sub.lastStorageWarnNotificationAt = now;
          await sub.save();
          console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Storage Warning (${percent.toFixed(1)}%) FCM to parent_${parentUserId}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`[SUBSCRIPTION-NOTIF-SCAN-ERROR] ${err?.message}`);
  }
};

export const initSubscriptionQueue = async () => {
  if (!config.redisUri) {
    console.warn('[SUBSCRIPTION-QUEUE-WARN] REDIS_URI not configured. Running in-memory interval fallback (60s).');
    setInterval(async () => {
      await processSubscriptionJobs().catch((e) => console.error('[SUBSCRIPTION-CRON-FALLBACK-ERR]', e?.message));
    }, 60000);
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

    // Remove stale repeatables so interval changes take effect
    const reps = await (subscriptionQueue as any).getRepeatableJobs().catch(() => []);
    for (const r of reps) {
      await (subscriptionQueue as any).removeRepeatableByKey(r.key).catch(() => {});
    }

    const scanMs = Number(process.env.SUBSCRIPTION_SCAN_MS) || 60000;

    // Schedule repeatable job
    await (subscriptionQueue.add as any)(
      'subscription-scan-job',
      {},
      {
        repeat: { every: scanMs },
        jobId: 'repeatable-subscription-scan-job',
      }
    );

    console.log(`[SUBSCRIPTION-QUEUE] Subscription & Notification BullMQ Queue initialized with scan interval: ${scanMs}ms.`);
  } catch (err: any) {
    console.warn('[SUBSCRIPTION-QUEUE-ERROR] Failed to initialize subscription queue:', err.message);
  }
};
