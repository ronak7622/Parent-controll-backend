import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { Subscription } from '../models/Subscription';
import { Device } from '../models/Device';
import { User } from '../models/User';
import { sendFcmTopicNotification, sendLocalizedFcmTopicNotification } from '../services/fcm.service';
import { formatRelativeDateTimeForNotification } from '../config/notificationTemplates';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { ConfigService } from '../services/ConfigService';
import { SubscriptionJob } from '../jobs/SubscriptionJob';
import { processPendingAppRemovals } from '../controllers/device.controller';

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
  // 0. VERIFY PENDING APP REMOVALS (Admin disabled followed by silence -> App Removed)
  // -----------------------------------------------------------------
  try {
    await processPendingAppRemovals();
  } catch (err: any) {
    console.error(`[PENDING-APP-REMOVALS-ERROR] ${err?.message}`);
  }

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

  // -----------------------------------------------------------------
  // 3. SCHEDULED BATCH DEVICE WARNINGS (Combined Multi-Device: App Removed, Critical Perms Off, Location Off)
  // Periodic FCM push notifications grouped per parent user so multiple affected devices produce ONE combined alert
  // -----------------------------------------------------------------
  try {
    const devicesNeedingAlert = await Device.find({
      $or: [
        { appRemoved: true },
        { criticalPermissionsOff: true },
        { 'grantedPermissions.ACCESSIBILITY': false },
        { 'grantedPermissions.DEVICE_ADMIN': false },
      ],
      parentUserId: { $exists: true, $ne: null },
      isPaired: { $ne: false },
      isSetupComplete: true,
    });

    // Group devices by parentUserId
    const devicesByParent = new Map<string, any[]>();
    for (const dev of devicesNeedingAlert) {
      const pId = String(dev.parentUserId);
      if (!devicesByParent.has(pId)) devicesByParent.set(pId, []);
      devicesByParent.get(pId)!.push(dev);
    }

    for (const [parentUserId, pDevs] of devicesByParent.entries()) {
      try {
        const parentUser = await User.findById(parentUserId).select('languageCode timezone timeZone fcmToken').lean();
        const lang = parentUser?.languageCode || 'en';
        const parentTz = (parentUser as any)?.timezone || (parentUser as any)?.timeZone || 'Asia/Kolkata';
        const parentTopic = `parent_${parentUserId}`;

        // ─── 3A. APP REMOVED ALERT (Multi-Device Grouped) ───
        const removedDevs = pDevs.filter((d) => d.appRemoved === true);
        if (removedDevs.length > 0) {
          const afterMin = Number(options.appRemovedWarNotificationAfterTimeInMinute) || 4320;
          const intervalMin = Number(options.appRemovedWarNotificationIntervalInMinute) || 1440;

          const dueRemoved = removedDevs.filter((dev) => {
            const removedAt = dev.appRemovedAt ? new Date(dev.appRemovedAt).getTime() : now.getTime();
            const minutesSinceRemoved = Math.floor((now.getTime() - removedAt) / (60 * 1000));
            if (minutesSinceRemoved < 0 || minutesSinceRemoved > afterMin) return false;
            const lastNotif = dev.appRemovedNotifiedAt ? new Date(dev.appRemovedNotifiedAt).getTime() : 0;
            return now.getTime() - lastNotif >= intervalMin * 60 * 1000;
          });

          if (dueRemoved.length > 0) {
            const devPayloadList = removedDevs.map((d) => {
              const devRemovedTime = d.appRemovedAt ? new Date(d.appRemovedAt) : now;
              const timeText = formatRelativeDateTimeForNotification(devRemovedTime, lang, parentTz);
              return {
                deviceId: String(d.deviceId),
                deviceName: d.deviceName || 'Child Device',
                appRemovedAt: devRemovedTime.toISOString(),
                timeText,
              };
            });

            if (removedDevs.length === 1) {
              const singleDev = devPayloadList[0];
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'DEVICE_APP_REMOVED',
                {
                  deviceName: singleDev.deviceName,
                  timeText: singleDev.timeText,
                  timeInfo: singleDev.timeText ? ` (${singleDev.timeText})` : '',
                },
                lang,
                {
                  type: 'APP_REMOVED',
                  deviceId: singleDev.deviceId,
                  deviceName: singleDev.deviceName,
                  appRemovedAt: singleDev.appRemovedAt,
                  timeText: singleDev.timeText,
                  deviceCount: '1',
                  devices: JSON.stringify(devPayloadList),
                  timezone: parentTz,
                }
              );
            } else {
              const deviceList = devPayloadList.map((d) => `${d.deviceName} (${d.timeText})`).join(', ');
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'DEVICE_APP_REMOVED_MULTI',
                {
                  count: removedDevs.length,
                  deviceList,
                },
                lang,
                {
                  type: 'APP_REMOVED',
                  deviceCount: String(removedDevs.length),
                  devices: JSON.stringify(devPayloadList),
                  timezone: parentTz,
                }
              );
            }

            const dueIds = dueRemoved.map((d) => d._id);
            await Device.updateMany({ _id: { $in: dueIds } }, { $set: { appRemovedNotifiedAt: now } });
            console.log(`[DEVICE-ALERT-QUEUE] Sent App Removed FCM to parent_${parentUserId} for ${removedDevs.length} device(s)`);
          }
        }

        // ─── 3B. CRITICAL PERMISSIONS OFF ALERT (Multi-Device Grouped) ───
        const permOffDevs = pDevs.filter(
          (d) =>
            !d.appRemoved &&
            (d.criticalPermissionsOff ||
              d.grantedPermissions?.ACCESSIBILITY === false ||
              d.grantedPermissions?.DEVICE_ADMIN === false)
        );

        if (permOffDevs.length > 0) {
          const afterMin = Number(options.permissionOffWarNotificationAfterTimeInMinute) || 4320;
          const intervalMin = Number(options.permissionOffWarNotificationIntervalInMinute) || 1440;

          const duePermOff = permOffDevs.filter((dev) => {
            const offAt = dev.criticalPermissionsOffAt ? new Date(dev.criticalPermissionsOffAt).getTime() : now.getTime();
            const minutesSinceOff = Math.floor((now.getTime() - offAt) / (60 * 1000));
            if (minutesSinceOff < 0 || minutesSinceOff > afterMin) return false;
            const lastNotif = dev.criticalPermissionsNotifiedAt ? new Date(dev.criticalPermissionsNotifiedAt).getTime() : 0;
            return now.getTime() - lastNotif >= intervalMin * 60 * 1000;
          });

          if (duePermOff.length > 0) {
            const devPayloadList = permOffDevs.map((d) => {
              const devOffTime = d.criticalPermissionsOffAt ? new Date(d.criticalPermissionsOffAt) : now;
              const timeText = formatRelativeDateTimeForNotification(devOffTime, lang, parentTz);
              return {
                deviceId: String(d.deviceId),
                deviceName: d.deviceName || 'Child Device',
                criticalPermissionsOffAt: devOffTime.toISOString(),
                timeText,
                grantedPermissions: d.grantedPermissions || {},
              };
            });

            if (permOffDevs.length === 1) {
              const singleDev = devPayloadList[0];
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'DEVICE_CRITICAL_PERM_OFF',
                {
                  deviceName: singleDev.deviceName,
                  timeText: singleDev.timeText,
                  timeInfo: singleDev.timeText ? ` (${singleDev.timeText})` : '',
                },
                lang,
                {
                  type: 'CRITICAL_PERMISSIONS_OFF',
                  deviceId: singleDev.deviceId,
                  deviceName: singleDev.deviceName,
                  criticalPermissionsOffAt: singleDev.criticalPermissionsOffAt,
                  timeText: singleDev.timeText,
                  deviceCount: '1',
                  devices: JSON.stringify(devPayloadList),
                  timezone: parentTz,
                }
              );
            } else {
              const deviceList = devPayloadList.map((d) => `${d.deviceName} (${d.timeText})`).join(', ');
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'DEVICE_CRITICAL_PERM_OFF_MULTI',
                {
                  count: permOffDevs.length,
                  deviceList,
                },
                lang,
                {
                  type: 'CRITICAL_PERMISSIONS_OFF',
                  deviceCount: String(permOffDevs.length),
                  devices: JSON.stringify(devPayloadList),
                  timezone: parentTz,
                }
              );
            }

            const dueIds = duePermOff.map((d) => d._id);
            await Device.updateMany(
              { _id: { $in: dueIds } },
              {
                $set: {
                  criticalPermissionsNotifiedAt: now,
                  criticalPermissionsOff: true,
                },
              }
            );
            console.log(`[DEVICE-ALERT-QUEUE] Sent Critical Perm Off FCM to parent_${parentUserId} for ${permOffDevs.length} device(s)`);
          }
        }
      } catch (parentDevErr: any) {
        console.error(`[DEVICE-ALERT-QUEUE] Error processing alerts for parent ${parentUserId}:`, parentDevErr?.message);
      }
    }
  } catch (deviceAlertErr: any) {
    console.error(`[DEVICE-ALERT-SCAN-ERROR] ${deviceAlertErr?.message}`);
  }

  // -----------------------------------------------------------------
  // 4. SCHEDULED BATCH CHILD APP CRITICAL UPDATE FCM NOTIFICATIONS (Multi-Device Grouped)
  // Fires periodically when childAppNeedToUpdate is true, parent has active plan,
  // device is not appRemoved, and appVersionCode < childAppVersion.
  // -----------------------------------------------------------------
  if (options.childAppNeedToUpdate === true && Number(options.childAppVersion) > 0) {
    try {
      const targetVersion = Number(options.childAppVersion);
      const updateIntervalMin = Number(options.childAppNeedToUpdateIntervalForNotification) || 1440;
      const outdatedDevices = await Device.find({
        parentUserId: { $exists: true, $ne: null },
        isPaired: { $ne: false },
        isSetupComplete: true,
        appRemoved: { $ne: true },
        $or: [
          { appVersionCode: { $lt: targetVersion } },
          { appVersionCode: { $exists: false } },
          { appVersionCode: null },
        ],
      });

      if (outdatedDevices.length > 0) {
        const activeSubscriptions = await Subscription.find({
          status: { $in: ['active', 'trial', 'grace'] },
        }).select('parentUserId').lean();
        const activeParentIds = new Set(activeSubscriptions.map((s) => String(s.parentUserId)));

        // Group outdated devices by parent
        const outdatedByParent = new Map<string, any[]>();
        for (const dev of outdatedDevices) {
          const pId = String(dev.parentUserId);
          if (!activeParentIds.has(pId)) continue;
          if (!outdatedByParent.has(pId)) outdatedByParent.set(pId, []);
          outdatedByParent.get(pId)!.push(dev);
        }

        for (const [parentUserId, pOutdatedList] of outdatedByParent.entries()) {
          const dueOutdated = pOutdatedList.filter((dev) => {
            const lastNotif = dev.childAppUpdateNotifiedAt ? new Date(dev.childAppUpdateNotifiedAt).getTime() : 0;
            return now.getTime() - lastNotif >= updateIntervalMin * 60 * 1000;
          });

          if (dueOutdated.length > 0) {
            const parentUser = await User.findById(parentUserId).select('languageCode timezone timeZone').lean();
            const lang = parentUser?.languageCode || 'en';
            const parentTopic = `parent_${parentUserId}`;
            const versionName = options.childAppVersionName || `v${targetVersion}`;

            const devPayloadList = pOutdatedList.map((d) => ({
              deviceId: String(d.deviceId),
              deviceName: d.deviceName || 'Child Device',
              appVersionCode: d.appVersionCode || 0,
              appVersionName: d.appVersionName || '',
            }));

            if (pOutdatedList.length === 1) {
              const dev = pOutdatedList[0];
              const devName = dev.deviceName || 'Child Device';
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'CHILD_APP_UPDATE_REQUIRED',
                {
                  childName: devName,
                  deviceName: devName,
                  versionName,
                },
                lang,
                {
                  type: 'CHILD_APP_UPDATE_REQUIRED',
                  deviceId: dev.deviceId,
                  deviceName: devName,
                  versionCode: String(targetVersion),
                  versionName,
                  deviceCount: '1',
                  devices: JSON.stringify(devPayloadList),
                }
              );
            } else {
              const deviceList = pOutdatedList.map((d) => d.deviceName || 'Child Device').join(', ');
              await sendLocalizedFcmTopicNotification(
                parentTopic,
                'CHILD_APP_UPDATE_REQUIRED_MULTI',
                {
                  count: pOutdatedList.length,
                  deviceList,
                  versionName,
                },
                lang,
                {
                  type: 'CHILD_APP_UPDATE_REQUIRED',
                  deviceCount: String(pOutdatedList.length),
                  versionCode: String(targetVersion),
                  versionName,
                  devices: JSON.stringify(devPayloadList),
                }
              );
            }

            const dueIds = dueOutdated.map((d) => d._id);
            await Device.updateMany({ _id: { $in: dueIds } }, { $set: { childAppUpdateNotifiedAt: now } });
            console.log(`[DEVICE-ALERT-QUEUE] Sent Child App Update FCM to parent_${parentUserId} for ${pOutdatedList.length} device(s)`);
          }
        }
      }
    } catch (childUpdateErr: any) {
      console.error(`[CHILD-UPDATE-ALERT-SCAN-ERROR] ${childUpdateErr?.message}`);
    }
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

    const scanMs = Number(process.env.SUBSCRIPTION_SCAN_MS) || 60000;

    // BullMQ v6 Job Scheduler (replaces the deprecated repeatable-jobs API).
    // Idempotent: a single scheduler is upserted, so interval changes apply cleanly
    // on every boot without the old remove-all-then-add dance.
    await subscriptionQueue.upsertJobScheduler(
      'subscription-scan-scheduler',
      { every: scanMs },
      {
        name: 'subscription-scan-job',
        data: {},
      }
    );

    console.log(`[SUBSCRIPTION-QUEUE] Job Scheduler initialized. Interval: ${scanMs}ms`);
  } catch (err: any) {
    console.warn('[SUBSCRIPTION-QUEUE-ERROR] Failed to initialize subscription queue:', err.message);
  }
};
