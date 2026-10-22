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
    const activeSubs = await Subscription.find({ status: { $in: ['active', 'trial', 'grace', 'expired'] } });

    for (const sub of activeSubs) {
     try {
      const parentUserId = sub.parentUserId;

      // If an advance plan is queued (§5), suppress ONLY the expiring-soon / expired warnings (A1/A2).
      // Storage warnings (B) must STILL fire — storage filling up is independent of plan expiry.
      const hasQueuedPlan = Boolean(sub.queuedPlan && sub.queuedPlan.planSnapshot);

      // ─── A1. EXPIRING SOON FCM NOTIFICATION (Minutes & Interval from Remote Config) ───
      if (!hasQueuedPlan && sub.expireAt && sub.expireAt.getTime() > now.getTime()) {
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
              ? { hours: Math.max(1, Math.ceil(remainingMinutes / 60)), time: timeText }
              : { time: timeText, days: Math.max(1, Math.ceil(remainingMinutes / 1440)) };

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

            await Subscription.updateOne({ _id: sub._id }, { $set: { lastExpireWarnNotificationAt: now } });
            console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Expiring Soon FCM to parent_${parentUserId} (${timeText} left)`);
          }
        }
      }

      // ─── A2. PLAN EXPIRED / GRACE PERIOD FCM NOTIFICATION (Interval & Window from Remote Config) ───
      if (!hasQueuedPlan && sub.expireAt && sub.expireAt.getTime() <= now.getTime()) {
        const isTrial = sub.isTrial || sub.planSnapshot?.type === 'trial';
        const minutesSinceExpiry = Math.floor((now.getTime() - sub.expireAt.getTime()) / (60 * 1000));

        const afterMinutes = isTrial
          ? (options.trialExpiredWarNotificationAfterTimeInMinute || 60)
          : (options.expiredWarNotificationAfterTimeInMinute || 4320);

        const intervalMinutes = isTrial
          ? (options.trialExpiredWarNotificationIntervalInMinute || 120)
          : (options.expiredWarNotificationIntervalInMinute || 1440);

        // Window check: only send while within [0, afterMinutes] after expiry
        if (minutesSinceExpiry >= 0 && minutesSinceExpiry <= afterMinutes) {
          const lastExpireNotif = sub.lastExpireWarnNotificationAt ? new Date(sub.lastExpireWarnNotificationAt).getTime() : 0;
          if (now.getTime() - lastExpireNotif >= intervalMinutes * 60 * 1000) {
            const isPastGrace = sub.graceEndsAt ? now.getTime() >= new Date(sub.graceEndsAt).getTime() : (sub.status === 'expired');
            const remainingGraceMin = sub.graceEndsAt ? Math.max(0, Math.round((new Date(sub.graceEndsAt).getTime() - now.getTime()) / (60 * 1000))) : 0;

            const days = Math.floor(remainingGraceMin / 1440);
            const hours = Math.floor((remainingGraceMin % 1440) / 60);
            const mins = remainingGraceMin % 60;
            const graceText = days > 0
              ? `${days} Day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} Hr${hours > 1 ? 's' : ''}` : ''}`
              : hours > 0
                ? `${hours} Hr${hours > 1 ? 's' : ''}${mins > 0 ? ` ${mins} Min${mins > 1 ? 's' : ''}` : ''}`
                : `${mins} Min${mins > 1 ? 's' : ''}`;

            const templateKey = isPastGrace
              ? (isTrial ? 'TRIAL_EXPIRED_STOPPED' : 'PLAN_EXPIRED_STOPPED')
              : (isTrial ? 'TRIAL_EXPIRED_GRACE' : 'PLAN_EXPIRED_GRACE');

            await sendLocalizedFcmTopicNotification(
              `parent_${parentUserId}`,
              templateKey,
              { graceText },
              undefined,
              {
                type: 'plan_expired',
                isTrial: String(isTrial),
                isPastGrace: String(isPastGrace),
                minutesSinceExpiry: String(minutesSinceExpiry),
              }
            );

            await Subscription.updateOne({ _id: sub._id }, { $set: { lastExpireWarnNotificationAt: now } });
            console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Plan Expired FCM (${templateKey}) to parent_${parentUserId} (sinceExpiry: ${minutesSinceExpiry}m)`);
          }
        }
      }

      // ─── B. STORAGE USAGE FCM NOTIFICATION (Warn % & 100% Full with Interval) ───
      // Suppress storage warning and 100% full notifications completely if plan has expired, is in grace or cancelled
      const isPlanExpiredOrGrace = (sub.expireAt && sub.expireAt.getTime() <= now.getTime()) ||
        (sub.status as string) === 'expired' ||
        (sub.status as string) === 'grace' ||
        (sub.status as string) === 'cancelled';

      if (isPlanExpiredOrGrace) {
        continue;
      }

      const allowedBytes = (sub.planSnapshot?.storageBytes || 10737418240) + (sub.addonStorageBytes || 0);
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
          await Subscription.updateOne({ _id: sub._id }, { $set: { lastStorageWarnNotificationAt: now } });
          console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Storage 100% Full FCM to parent_${parentUserId}`);
        } else if (percent >= warnPercent) {
          await sendLocalizedFcmTopicNotification(
            `parent_${parentUserId}`,
            'STORAGE_WARNING',
            { percent: percent.toFixed(1) },
            undefined,
            { type: 'storage_warning', percent: percent.toFixed(1) }
          );
          await Subscription.updateOne({ _id: sub._id }, { $set: { lastStorageWarnNotificationAt: now } });
          console.log(`[SUBSCRIPTION-QUEUE-NOTIF] Sent Storage Warning (${percent.toFixed(1)}%) FCM to parent_${parentUserId}`);
        }
      }

      // If storage usage is below the warning threshold (e.g. after purchasing an add-on or deleting files),
      // reset lastStorageWarnNotificationAt so future real warnings fire promptly.
      if (percent < warnPercent && sub.lastStorageWarnNotificationAt) {
        await Subscription.updateOne({ _id: sub._id }, { $unset: { lastStorageWarnNotificationAt: 1 } });
      }
     } catch (subErr: any) {
       console.error(`[SUBSCRIPTION-NOTIF-SUB-ERROR] parent ${sub.parentUserId}: ${subErr?.message}`);
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
