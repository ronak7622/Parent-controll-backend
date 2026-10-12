import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { Subscription } from '../models/Subscription';
import { sendFcmTopicNotification } from '../services/fcm.service';
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
  // 2. SCHEDULED BATCH FCM NOTIFICATIONS (Storage Warn % & Expiry)
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

export const initSubscriptionQueue = async () => {
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
