import { Subscription } from '../models/Subscription';
import { StorageUsage } from '../models/StorageUsage';
import { LiveUsage } from '../models/LiveUsage';
import { User } from '../models/User';
import { Device } from '../models/Device';
import { Order } from '../models/Order';
import { ConfigService } from '../services/ConfigService';
import { StorageDeleteService } from '../services/StorageDeleteService';
import { StorageAccountingService } from '../services/StorageAccountingService';
import { sendFcmDataCommand, sendFcmTopicNotification, sendLocalizedFcmTopicNotification } from '../services/fcm.service';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { toMs } from '../utils/duration';

export class SubscriptionJob {
  /**
   * Run Subscription Expiry, Queued Plan Activation & Grace State Machine (Paginating 10M safe scan)
   */
  static async processSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      const getGraceMs = (sub: any) => {
        if (sub.planSnapshot?.graceTimeInMinute && sub.planSnapshot.graceTimeInMinute > 0) {
          return sub.planSnapshot.graceTimeInMinute * 60 * 1000;
        }
        return 4320 * 60 * 1000; // 3 days (4320 minutes)
      };

      const getDurationMs = (q: any) => {
        if (q.durationMs && q.durationMs > 0) return q.durationMs;
        if (q.planSnapshot?.planDurationValueInMinute && q.planSnapshot.planDurationValueInMinute > 0) {
          return q.planSnapshot.planDurationValueInMinute * 60 * 1000;
        }
        return toMs(q.durationDays || q.planSnapshot?.dayLimit || 30, 'days');
      };

      // 1. Check for Active / Trial subs that reached expireAt:
      // If a queued advance plan exists -> auto-activate queued plan!
      // Otherwise -> transition to GRACE window
      const expiringSubs = await Subscription.find({
        status: { $in: ['active', 'trial'] },
        expireAt: { $lte: now },
      }).limit(500);

      for (const sub of expiringSubs) {
        if (sub.queuedPlan && sub.queuedPlan.planSnapshot) {
          // AUTO-ACTIVATE QUEUED ADVANCE PLAN
          const q = sub.queuedPlan;
          const dMs = getDurationMs(q);
          const newStartAt = now;
          const newExpireAt = new Date(newStartAt.getTime() + dMs);
          const graceEndsAt = new Date(newExpireAt.getTime() + getGraceMs({ planSnapshot: q.planSnapshot }));

          sub.status = 'active';
          sub.planSnapshot = q.planSnapshot;
          sub.startAt = newStartAt;
          sub.expireAt = newExpireAt;
          sub.graceEndsAt = graceEndsAt;
          sub.txnId = q.txnId;
          sub.region = q.region || sub.region;
          sub.isTrial = false;
          sub.planLiveMinutesUsed = 0;

          // Apply queued add-ons if any
          if (q.storageAddon) {
            sub.addonStorageBytes = (sub.addonStorageBytes || 0) + (q.storageAddon.storageBytes || 0);
            sub.lastPurchasedStorageAddonId = q.storageAddon.addonId;
          }
          if (q.liveAddon) {
            sub.addonLiveMinutesPool = (sub.addonLiveMinutesPool || 0) + (q.liveAddon.liveMinutes || 0);
            sub.lastPurchasedLiveAddonId = q.liveAddon.addonId;
          }

          // If queued plan had storage downgrade confirmed, trim oldest excess data upon activation
          if (q.allowStorageTrim) {
            const newAllowedBytes = (q.planSnapshot?.storageBytes || 10737418240) + (sub.addonStorageBytes || 0);
            const currentUsage = await StorageAccountingService.getStorageUsage(sub.parentUserId);
            if (currentUsage && currentUsage.totalBytes > newAllowedBytes) {
              await StorageDeleteService.trimOldestExcessStorage(sub.parentUserId, newAllowedBytes);
            }
          }

          sub.queuedPlan = undefined;
          await sub.save();
          if (q.txnId) {
            await Order.updateMany(
              { $or: [{ txnId: q.txnId }, { 'metadata.parentTxnId': q.txnId }] },
              { $set: { status: 'completed' } }
            ).catch(() => {});
          }
          console.log(`[SUBSCRIPTION-JOB] Auto-activated queued plan for parent ${sub.parentUserId}. New expiry: ${newExpireAt}`);

          // Signal child devices to resume/ensure active
          const devs = await Device.find({ parentUserId: sub.parentUserId });
          for (const d of devs) {
            if (d.fcmToken) {
              await sendFcmDataCommand(d.fcmToken, 'SUBSCRIPTION_RESUME', {
                status: 'active',
                expireAt: newExpireAt.toISOString(),
                graceEndsAt: graceEndsAt.toISOString(),
              }).catch(() => {});
            }
          }
        } else {
          // Transition to GRACE state
          sub.status = 'grace';
          const graceMs = getGraceMs(sub);
          sub.graceEndsAt = new Date(sub.expireAt.getTime() + graceMs);
          await sub.save();
          console.log(`[SUBSCRIPTION-JOB] Transitioned parent ${sub.parentUserId} to GRACE state. Grace ends at: ${sub.graceEndsAt}`);

          if (sub.graceEndsAt.getTime() > now.getTime()) {
            // Send FCM Notification to parent device (received even when parent app is killed / closed)
            try {
              const isTrial = sub.isTrial || sub.planSnapshot?.type === 'trial';
              const remainingGraceMin = Math.round((sub.graceEndsAt.getTime() - now.getTime()) / (60 * 1000));
              const days = Math.floor(remainingGraceMin / 1440);
              const hours = Math.floor((remainingGraceMin % 1440) / 60);
              const mins = remainingGraceMin % 60;
              const graceText = days > 0
                  ? `${days} Day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} Hr${hours > 1 ? 's' : ''}` : ''}`
                  : hours > 0
                      ? `${hours} Hr${hours > 1 ? 's' : ''}${mins > 0 ? ` ${mins} Min${mins > 1 ? 's' : ''}` : ''}`
                      : `${mins} Min${mins > 1 ? 's' : ''}`;

              const templateKey = isTrial ? 'TRIAL_EXPIRED_GRACE' : 'PLAN_EXPIRED_GRACE';
              await sendLocalizedFcmTopicNotification(
                `parent_${sub.parentUserId}`,
                templateKey,
                { graceText },
                undefined,
                {
                  type: 'plan_expired_grace',
                  isTrial: String(isTrial),
                }
              );
            } catch (e: any) {
              console.error(`[SUBSCRIPTION-JOB-FCM-GRACE-ERROR] ${e?.message}`);
            }
          }
        }
      }

      // 2. Transition Grace -> Expired when graceEndsAt is reached (Purge data + Full Stop monitoring)
      // Reconciliation: Catch status='grace' with graceEndsAt <= now, AND also pick up any subscription
      // that is effectively past grace but got stuck — e.g. status in ['grace', 'expired'] with no active plan
      // where storage or data is still present.
      const postGraceSubs = await Subscription.find({
        $or: [
          { status: 'grace', graceEndsAt: { $lte: now } },
          { status: 'expired' },
        ],
      }).limit(500);

      // Also reconcile any parents whose StorageUsage has totalBytes > 0 but their subscription is not active
      const dirtyUsages = await StorageUsage.find({ totalBytes: { $gt: 0 } }).limit(200);
      const postGraceParentIds = new Set<string>(postGraceSubs.map((s) => s.parentUserId));

      for (const du of dirtyUsages) {
        if (!postGraceParentIds.has(du.parentUserId)) {
          const sub = await Subscription.findOne({ parentUserId: du.parentUserId });
          if (!sub || sub.status === 'expired' || (sub.status === 'grace' && sub.graceEndsAt && sub.graceEndsAt.getTime() <= now.getTime())) {
            if (sub) {
              postGraceSubs.push(sub);
              postGraceParentIds.add(sub.parentUserId);
            } else {
              // No sub record at all, but dirty storage exists -> wipe devices and zero storage
              const orphanDevices = await Device.find({ parentUserId: du.parentUserId });
              for (const dev of orphanDevices) {
                try {
                  await StorageDeleteService.eraseAllDeviceData(dev.deviceId, du.parentUserId, true);
                  try {
                    getSignalingIo()?.to(dev.deviceId).emit('remote-command', {
                      command: 'MONITORING_STOP',
                      action: 'WIPE_LOCAL_AND_STOP',
                      deviceId: dev.deviceId,
                      status: 'expired',
                    });
                  } catch (_) {}
                  if (dev.fcmToken) {
                    await sendFcmDataCommand(dev.fcmToken, 'MONITORING_STOP', {
                      status: 'expired',
                      action: 'WIPE_LOCAL_AND_STOP',
                    }).catch(() => {});
                  }
                } catch (devErr: any) {
                  console.error(`[SUBSCRIPTION-WIPE-ERROR] Orphan Device ${dev.deviceId} (${du.parentUserId}): ${devErr?.message}`);
                }
              }
              try {
                await LiveUsage.deleteMany({ parentUserId: du.parentUserId });
              } catch (_) {}
              try {
                await StorageUsage.deleteMany({ parentUserId: du.parentUserId });
              } catch (_) {}
              await StorageAccountingService.invalidateCache(du.parentUserId);
            }
          }
        }
      }

      for (const sub of postGraceSubs) {
        // If a queued plan arrived, activate it instead of wiping
        if (sub.queuedPlan && sub.queuedPlan.planSnapshot) {
          const q = sub.queuedPlan;
          const dMs = getDurationMs(q);
          const newStartAt = now;
          const newExpireAt = new Date(newStartAt.getTime() + dMs);
          const graceEndsAt = new Date(newExpireAt.getTime() + getGraceMs({ planSnapshot: q.planSnapshot }));

          sub.status = 'active';
          sub.planSnapshot = q.planSnapshot;
          sub.startAt = newStartAt;
          sub.expireAt = newExpireAt;
          sub.graceEndsAt = graceEndsAt;
          sub.txnId = q.txnId;
          sub.region = q.region || sub.region;
          sub.isTrial = false;
          sub.planLiveMinutesUsed = 0;

          if (q.storageAddon) {
            sub.addonStorageBytes = (sub.addonStorageBytes || 0) + (q.storageAddon.storageBytes || 0);
            sub.lastPurchasedStorageAddonId = q.storageAddon.addonId;
          }
          if (q.liveAddon) {
            sub.addonLiveMinutesPool = (sub.addonLiveMinutesPool || 0) + (q.liveAddon.liveMinutes || 0);
            sub.lastPurchasedLiveAddonId = q.liveAddon.addonId;
          }

          // If queued plan had storage downgrade confirmed, trim oldest excess data upon activation
          if (q.allowStorageTrim) {
            const newAllowedBytes = (q.planSnapshot?.storageBytes || 10737418240) + (sub.addonStorageBytes || 0);
            const currentUsage = await StorageAccountingService.getStorageUsage(sub.parentUserId);
            if (currentUsage && currentUsage.totalBytes > newAllowedBytes) {
              await StorageDeleteService.trimOldestExcessStorage(sub.parentUserId, newAllowedBytes);
            }
          }

          sub.queuedPlan = undefined;
          await sub.save();
          if (q.txnId) {
            await Order.updateMany(
              { $or: [{ txnId: q.txnId }, { 'metadata.parentTxnId': q.txnId }] },
              { $set: { status: 'completed' } }
            ).catch(() => {});
          }
          continue;
        }

        const wasGrace = sub.status === 'grace';
        sub.status = 'expired';
        // Add-ons expire at main plan validity end (no carry-forward)
        sub.addonStorageBytes = 0;
        sub.addonLiveMinutesPool = 0;
        await sub.save();

        if (wasGrace) {
          // Send FCM Notification to parent device (received even when parent app is killed / closed)
          try {
            const isTrial = sub.isTrial || sub.planSnapshot?.type === 'trial';
            const templateKey = isTrial ? 'TRIAL_EXPIRED_STOPPED' : 'PLAN_EXPIRED_STOPPED';

            await sendLocalizedFcmTopicNotification(
              `parent_${sub.parentUserId}`,
              templateKey,
              {},
              undefined,
              {
                type: 'plan_expired_stopped',
                isTrial: String(isTrial),
              }
            );
          } catch (e: any) {
            console.error(`[SUBSCRIPTION-JOB-FCM-EXPIRED-ERROR] ${e?.message}`);
          }
        }

        // Find connected devices
        const devices = await Device.find({ parentUserId: sub.parentUserId });
        const storageUsage = await StorageUsage.findOne({ parentUserId: sub.parentUserId });
        const hasData = (storageUsage && storageUsage.totalBytes > 0) || wasGrace;

        if (hasData || devices.length > 0) {
          console.warn(`[SUBSCRIPTION-JOB] Grace ended / expired reconciliation for parent ${sub.parentUserId}! Purging server media + text data (${devices.length} devices)...`);

          // FULL STOP + WIPE:
          // Server: delete all connected devices' media + text data from R2 + Mongo.
          // Keep ONLY: device-connection records + purchase history (Orders).
          for (const dev of devices) {
            try {
              await StorageDeleteService.eraseAllDeviceData(dev.deviceId, sub.parentUserId, true);
              // Send Socket.IO remote-command to child
              try {
                getSignalingIo()?.to(dev.deviceId).emit('remote-command', {
                  command: 'MONITORING_STOP',
                  action: 'WIPE_LOCAL_AND_STOP',
                  deviceId: dev.deviceId,
                  status: 'expired',
                });
              } catch (_) {}
              // Send FCM stop command to child
              if (dev.fcmToken) {
                await sendFcmDataCommand(dev.fcmToken, 'MONITORING_STOP', {
                  status: 'expired',
                  action: 'WIPE_LOCAL_AND_STOP',
                }).catch((fcmErr) => {
                  console.warn(`[FCM-WIPE-WARN] FCM to device ${dev.deviceId} failed: ${fcmErr?.message}`);
                });
              }
            } catch (e: any) {
              console.error(`[SUBSCRIPTION-WIPE-ERROR] Device ${dev.deviceId} (${sub.parentUserId}) wipe failed: ${e?.message}`);
            }
          }

          // Purge parent-scoped LiveUsage and StorageUsage documents completely
          try {
            await LiveUsage.deleteMany({ parentUserId: sub.parentUserId });
          } catch (e: any) {
            console.warn(`[SUBSCRIPTION-JOB] Error deleting LiveUsage for ${sub.parentUserId}:`, e?.message);
          }
          try {
            await StorageUsage.deleteMany({ parentUserId: sub.parentUserId });
          } catch (e: any) {
            console.warn(`[SUBSCRIPTION-JOB] Error deleting StorageUsage for ${sub.parentUserId}:`, e?.message);
          }
          await StorageAccountingService.invalidateCache(sub.parentUserId);
        }
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
      const activeDevParentIds = await Device.distinct('parentUserId', { autoDeleteIsEnabled: true });
      const activeAutoDeleteUsers = await User.find({
        $or: [
          { autoDeleteIsEnabled: true },
          { _id: { $in: activeDevParentIds.filter(Boolean) } },
        ],
      }).limit(500);

      for (const u of activeAutoDeleteUsers) {
        await StorageDeleteService.executeParentAutoDeletePurge(u._id.toString());
      }
    } catch (err: any) {
      console.error(`[AUTO-DELETE-JOB-ERROR] ${err?.message}`);
    }
  }
}
