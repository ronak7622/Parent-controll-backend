import { LiveUsage } from '../models/LiveUsage';
import { Subscription } from '../models/Subscription';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { ConfigService } from './ConfigService';
import { sendLocalizedFcmTopicNotification } from './fcm.service';

export interface ActiveLiveSession {
  sessionId: string;
  parentUserId: string;
  deviceId: string;
  rawDeviceId?: string;
  parentSocketId: string;
  childSocketId?: string;
  type: string;
  startedAt: Date;
  mediaStartedAt?: Date;
  allowedMinutes: number;
  dailyPlanLimit: number;
  dayKey: string;
  limitedBySessionCap: boolean;
  willExhaustPlanTotal?: boolean;
  cutoffTimer?: NodeJS.Timeout;
  isEnded?: boolean;
}

export class LiveUsageService {
  private static activeSessions = new Map<string, ActiveLiveSession>();
  private static deviceToSession = new Map<string, string>();
  private static socketToSession = new Map<string, string>();

  /**
   * Helper to format today's day key ("YYYY-MM-DD")
   */
  public static getDayKey(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  public static getMonthKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Check remaining live minutes (daily plan limit + overall plan limit + add-on booster pool)
   */
  public static async getRemainingLiveMinutes(parentUserId: string): Promise<{
    hasSubscription: boolean;
    isExpired: boolean;
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
    planTotalLimit: number;
    planTotalUsed: number;
    planTotalRemaining: number;
    basePlanRemainingToday: number;
    addonPoolRemaining: number;
    totalRemaining: number;
    sub: any;
  }> {
    const sub = await Subscription.findOne({
      parentUserId,
      status: { $in: ['active', 'trial', 'grace'] },
    });

    if (!sub || sub.status === 'expired') {
      return {
        hasSubscription: !!sub,
        isExpired: true,
        dailyLimit: 0,
        dailyUsed: 0,
        dailyRemaining: 0,
        planTotalLimit: 0,
        planTotalUsed: 0,
        planTotalRemaining: 0,
        basePlanRemainingToday: 0,
        addonPoolRemaining: 0,
        totalRemaining: 0,
        sub,
      };
    }

    const now = new Date();
    const dayKey = this.getDayKey(now);

    // 1. Overall Plan Cumulative Live Limit
    const planTotalLimit = Number(sub.planSnapshot?.liveLimitTotalInMinute ?? sub.planSnapshot?.liveMinutesTotal ?? 0);
    const planTotalUsed = Number(sub.planLiveMinutesUsed ?? 0);
    const hasTotalLimit = planTotalLimit > 0;
    const planTotalRemaining = hasTotalLimit ? Math.max(0, planTotalLimit - planTotalUsed) : Infinity;

    // 2. Daily Plan Limit
    const rawDailyLimit = Number(sub.planSnapshot?.liveLimitPerDayInMinutes ?? sub.planSnapshot?.liveLimitPerDay ?? 0);
    const hasDailyLimit = rawDailyLimit > 0;

    const liveUsage = await LiveUsage.findOne({ parentUserId, dayKey });
    const dailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyRemaining = hasDailyLimit ? Math.max(0, rawDailyLimit - dailyUsed) : Infinity;

    // 3. Base plan minutes remaining today:
    // If daily limit exists, today cannot exceed today's remaining daily limit.
    // Also, today cannot exceed what remains in the entire base plan!
    let basePlanRemainingToday = 0;
    if (hasDailyLimit && hasTotalLimit) {
      basePlanRemainingToday = Math.min(dailyRemaining, planTotalRemaining);
    } else if (hasDailyLimit) {
      basePlanRemainingToday = dailyRemaining;
    } else if (hasTotalLimit) {
      basePlanRemainingToday = planTotalRemaining;
    } else {
      basePlanRemainingToday = 999999;
    }

    const addonPoolRemaining = Math.max(0, sub.addonLiveMinutesPool || 0);
    const totalRemaining = (basePlanRemainingToday === Infinity ? 999999 : basePlanRemainingToday) + addonPoolRemaining;

    return {
      hasSubscription: true,
      isExpired: false,
      dailyLimit: hasDailyLimit ? rawDailyLimit : (hasTotalLimit ? planTotalLimit : 0),
      dailyUsed,
      dailyRemaining: basePlanRemainingToday === Infinity ? 999999 : basePlanRemainingToday,
      planTotalLimit,
      planTotalUsed,
      planTotalRemaining: hasTotalLimit ? planTotalRemaining : 999999,
      basePlanRemainingToday: basePlanRemainingToday === Infinity ? 999999 : basePlanRemainingToday,
      addonPoolRemaining,
      totalRemaining,
      sub,
    };
  }

  /**
   * Register a new live session grant.
   * Calculates maximum allowed minutes, enforces limits, sets up mid-session cutoff timer.
   */
  public static async grantSession(params: {
    sessionId: string;
    parentUserId: string;
    deviceId: string;
    rawDeviceId?: string;
    parentSocketId: string;
    type: string;
  }): Promise<{
    allowed: boolean;
    allowedMinutes: number;
    reason?: string;
    message?: string;
    canRetry?: boolean;
  }> {
    const { sessionId, parentUserId, deviceId, rawDeviceId, parentSocketId, type } = params;

    const remaining = await this.getRemainingLiveMinutes(parentUserId);
    if (!remaining.hasSubscription || remaining.isExpired) {
      return {
        allowed: false,
        allowedMinutes: 0,
        reason: 'SUBSCRIPTION_EXPIRED',
        message: 'Subscription plan expired. Please renew plan to access live view/stream.',
        canRetry: false,
      };
    }

    const hasTotalLimit = remaining.planTotalLimit > 0;
    const isPlanTotalExhausted = hasTotalLimit && remaining.planTotalRemaining <= 0 && remaining.addonPoolRemaining <= 0;

    if (remaining.totalRemaining <= 0) {
      if (isPlanTotalExhausted) {
        return {
          allowed: false,
          allowedMinutes: 0,
          reason: 'PLAN_TOTAL_LIVE_MINUTES_EXCEEDED',
          message: 'Plan total live minutes exhausted. Buy a live booster to continue live streaming.',
          canRetry: false,
        };
      }
      return {
        allowed: false,
        allowedMinutes: 0,
        reason: 'LIVE_MINUTES_EXCEEDED',
        message: 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.',
        canRetry: false,
      };
    }

    // Per-session limit cap strictly uses liveSessionMaxMin from ConfigService for all live features
    const options = await ConfigService.getMergedOptions();
    const perSessionCap = Number(options.liveSessionMaxMin) > 0 ? Number(options.liveSessionMaxMin) : 5;

    const sessionAllowedMinutes = perSessionCap > 0
      ? Math.min(remaining.totalRemaining, perSessionCap)
      : remaining.totalRemaining;
    const limitedBySessionCap = perSessionCap > 0 && perSessionCap < remaining.totalRemaining;

    if (sessionAllowedMinutes <= 0) {
      if (isPlanTotalExhausted) {
        return {
          allowed: false,
          allowedMinutes: 0,
          reason: 'PLAN_TOTAL_LIVE_MINUTES_EXCEEDED',
          message: 'Plan total live minutes exhausted. Buy a live booster to continue live streaming.',
          canRetry: false,
        };
      }
      return {
        allowed: false,
        allowedMinutes: 0,
        reason: 'LIVE_MINUTES_EXCEEDED',
        message: 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.',
        canRetry: false,
      };
    }

    // Clean up any stale existing session for this device
    const existingSessionId = this.deviceToSession.get(deviceId);
    if (existingSessionId && existingSessionId !== sessionId) {
      await this.endSession(existingSessionId, 'NEW_SESSION_OVERRIDE');
    }

    const willExhaustPlanTotal = hasTotalLimit &&
      remaining.addonPoolRemaining <= 0 &&
      (remaining.planTotalRemaining <= sessionAllowedMinutes);

    const session: ActiveLiveSession = {
      sessionId,
      parentUserId,
      deviceId,
      rawDeviceId,
      parentSocketId,
      type,
      startedAt: new Date(),
      allowedMinutes: sessionAllowedMinutes,
      dailyPlanLimit: remaining.dailyLimit,
      dayKey: this.getDayKey(),
      limitedBySessionCap,
      willExhaustPlanTotal,
      isEnded: false,
    };

    // Schedule mid-session cutoff timer: when allowedMinutes are reached, force-stop session!
    const cutoffDurationMs = sessionAllowedMinutes * 60 * 1000;
    session.cutoffTimer = setTimeout(async () => {
      console.log(`[LIVE-USAGE-CUTOFF] Session ${sessionId} reached max allowed time (${sessionAllowedMinutes} min). Force stopping...`);
      await LiveUsageService.cutoffSession(sessionId);
    }, cutoffDurationMs);

    this.activeSessions.set(sessionId, session);
    this.deviceToSession.set(deviceId, sessionId);
    if (rawDeviceId && rawDeviceId !== deviceId) {
      this.deviceToSession.set(rawDeviceId, sessionId);
    }
    this.socketToSession.set(parentSocketId, sessionId);

    console.log(`[LIVE-USAGE-GRANT] Session ${sessionId} granted for parent ${parentUserId}, device ${deviceId}. Max allowed: ${sessionAllowedMinutes} min (limitedBySessionCap: ${limitedBySessionCap}). Cutoff in ${cutoffDurationMs / 1000}s`);

    return {
      allowed: true,
      allowedMinutes: sessionAllowedMinutes,
    };
  }

  /**
   * Called when media SDP offer/answer is relayed (confirms actual streaming handshake)
   */
  public static markMediaConnected(sessionId?: string, deviceId?: string, childSocketId?: string) {
    const session = this.findSession(sessionId, deviceId);
    if (session && !session.mediaStartedAt) {
      session.mediaStartedAt = new Date();
      if (childSocketId) {
        session.childSocketId = childSocketId;
        this.socketToSession.set(childSocketId, session.sessionId);
      }
      console.log(`[LIVE-USAGE-MEDIA] Media connected for session ${session.sessionId}`);
    }
  }

  /**
   * Cutoff timer fired: force-stops stream and consumes allowed minutes
   */
  public static async cutoffSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.isEnded) return;

    const isSessionCap = session.limitedBySessionCap === true;
    let reason = isSessionCap ? 'SESSION_LIMIT_REACHED' : 'LIVE_MINUTES_EXCEEDED';
    let message = isSessionCap
      ? 'Per-session live limit reached. Tap Try Again to start a new session.'
      : 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.';
    const canRetry = isSessionCap;

    if (!isSessionCap && session.willExhaustPlanTotal) {
      reason = 'PLAN_TOTAL_LIVE_MINUTES_EXCEEDED';
      message = 'Plan total live minutes exhausted. Buy a live booster to continue live streaming.';
    }

    // Send stop-stream & stream-failed events to rooms via signaling IO
    try {
      const io = getSignalingIo();
      if (io) {
        const payload = {
          deviceId: session.deviceId,
          sessionId: session.sessionId,
          type: session.type,
          reason,
          message,
          canRetry,
        };

        io.to(session.deviceId).emit('stop-stream', { deviceId: session.deviceId, sessionId: session.sessionId });
        io.to(session.deviceId).emit('stream-failed', payload);

        if (session.rawDeviceId && session.rawDeviceId !== session.deviceId) {
          io.to(session.rawDeviceId).emit('stop-stream', { deviceId: session.rawDeviceId, sessionId: session.sessionId });
          io.to(session.rawDeviceId).emit('stream-failed', payload);
        }

        if (session.parentSocketId) {
          io.to(session.parentSocketId).emit('stop-stream', { deviceId: session.deviceId, sessionId: session.sessionId });
          io.to(session.parentSocketId).emit('stream-failed', payload);
        }
      }
    } catch (e: any) {
      console.error(`[LIVE-USAGE-CUTOFF-EMIT-ERR] ${e?.message}`);
    }

    // Per-session cutoff: no push notification sent (notifications only sent for daily limit, total limit, or booster exhausted).

    await this.endSession(sessionId, 'CUTOFF_TIMEOUT');
  }

  /**
   * Ends a live session and atomically increments LiveUsage and decrements Subscription addonLiveMinutesPool.
   */
  public static async endSession(sessionIdOrKey: string, reason: string = 'NORMAL'): Promise<number> {
    const session = this.activeSessions.get(sessionIdOrKey) ||
      (this.deviceToSession.has(sessionIdOrKey) ? this.activeSessions.get(this.deviceToSession.get(sessionIdOrKey)!) : undefined) ||
      (this.socketToSession.has(sessionIdOrKey) ? this.activeSessions.get(this.socketToSession.get(sessionIdOrKey)!) : undefined);

    if (!session) return 0;
    if (session.isEnded) {
      this.cleanupSessionReferences(session);
      return 0;
    }

    session.isEnded = true;
    if (session.cutoffTimer) {
      clearTimeout(session.cutoffTimer);
      session.cutoffTimer = undefined;
    }

    this.cleanupSessionReferences(session);

    // Only ACTUAL streamed media is billable. If media never connected (user clicked Live but it
    // stayed on "connecting" and then failed/was cancelled), mediaStartedAt is never set — charge 0.
    // The connecting phase must never consume the parent's live minutes.
    if (!session.mediaStartedAt) {
      console.log(`[LIVE-USAGE-END] Session ${session.sessionId} ended (${reason}) before media ever connected. No minutes charged.`);
      return 0;
    }

    // Compute elapsed duration from the moment media actually started (not from the request/connecting time)
    const startTime = session.mediaStartedAt;
    const elapsedMs = Math.max(0, Date.now() - startTime.getTime());
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // If stream disconnected in less than 5 seconds (immediate abort/network glitch), do not charge parent
    if (elapsedSeconds < 5 && reason !== 'CUTOFF_TIMEOUT') {
      console.log(`[LIVE-USAGE-END] Session ${session.sessionId} ran for only ${elapsedSeconds}s (< 5s grace). No minutes charged.`);
      return 0;
    }

    // Billable minutes: ceiling of elapsed minutes, bounded by sessionAllowedMinutes
    let minutesToCharge = Math.max(1, Math.ceil(elapsedSeconds / 60));
    if (minutesToCharge > session.allowedMinutes) {
      minutesToCharge = session.allowedMinutes;
    }

    console.log(`[LIVE-USAGE-END] Session ${session.sessionId} ended (${reason}). Elapsed: ${elapsedSeconds}s. Charging: ${minutesToCharge} minute(s).`);

    // Atomic consumption:
    // 1. Fetch current subscription and daily usage to compute available capacities
    const now = new Date();
    const dayKey = session.dayKey || this.getDayKey(now);
    const monthKey = this.getMonthKey(now);

    const sub = await Subscription.findOne({ parentUserId: session.parentUserId });
    const planTotalLimit = Number(sub?.planSnapshot?.liveLimitTotalInMinute ?? sub?.planSnapshot?.liveMinutesTotal ?? 0);
    const currentPlanTotalUsed = Number(sub?.planLiveMinutesUsed ?? 0);
    const hasTotalLimit = planTotalLimit > 0;
    const planCapacity = hasTotalLimit ? Math.max(0, planTotalLimit - currentPlanTotalUsed) : Infinity;

    const rawDailyLimit = Number(sub?.planSnapshot?.liveLimitPerDayInMinutes ?? sub?.planSnapshot?.liveLimitPerDay ?? session.dailyPlanLimit ?? 0);
    const hasDailyLimit = rawDailyLimit > 0;

    let liveUsage = await LiveUsage.findOne({ parentUserId: session.parentUserId, dayKey });
    const currentDailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyCapacity = hasDailyLimit ? Math.max(0, rawDailyLimit - currentDailyUsed) : Infinity;

    // Available capacity from base plan today:
    let availableBaseCapacity = 0;
    if (hasDailyLimit && hasTotalLimit) {
      availableBaseCapacity = Math.min(dailyCapacity, planCapacity);
    } else if (hasDailyLimit) {
      availableBaseCapacity = dailyCapacity;
    } else if (hasTotalLimit) {
      availableBaseCapacity = planCapacity;
    } else {
      availableBaseCapacity = minutesToCharge;
    }

    const toBase = Math.min(minutesToCharge, Math.max(0, availableBaseCapacity));
    const toAddon = minutesToCharge - toBase;

    console.log(`[LIVE-USAGE-SPLIT] Session ${session.sessionId}: Total=${minutesToCharge} min -> BasePlan=${toBase} min, AddonPool=${toAddon} min`);

    // 2. Atomic $inc on LiveUsage for today
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    await LiveUsage.findOneAndUpdate(
      { parentUserId: session.parentUserId, dayKey },
      {
        $inc: {
          dailyMinutesUsed: toBase,
          addonMinutesUsed: toAddon,
          minutesUsed: minutesToCharge,
        },
        $setOnInsert: {
          monthKey,
          resetAt: nextMidnight,
        },
      },
      { upsert: true, new: true }
    );

    // 3. Atomic $inc on Subscription.planLiveMinutesUsed and decrement addon pool if toAddon > 0
    const subUpdates: any = {};
    if (toBase > 0) {
      subUpdates.$inc = subUpdates.$inc || {};
      subUpdates.$inc.planLiveMinutesUsed = toBase;
    }
    if (toAddon > 0) {
      subUpdates.$inc = subUpdates.$inc || {};
      subUpdates.$inc.addonLiveMinutesPool = -toAddon;
    }

    if (Object.keys(subUpdates).length > 0) {
      await Subscription.updateOne(
        { parentUserId: session.parentUserId },
        subUpdates
      );
      if (toAddon > 0) {
        // Clamp pool to zero if it ever became negative
        await Subscription.updateOne(
          { parentUserId: session.parentUserId, addonLiveMinutesPool: { $lt: 0 } },
          { $set: { addonLiveMinutesPool: 0 } }
        );
      }
    }

    // 4. Live Limit Exhaustion Notifications (Active Real Plan only, single-time)
    try {
      const isTrial = sub?.status === 'trial' || sub?.isTrial === true || sub?.planSnapshot?.type === 'trial';
      const isRealActivePlan = sub && sub.status === 'active' && !isTrial;

      if (isRealActivePlan) {
        const prevDailyUsed = currentDailyUsed;
        const newDailyUsed = currentDailyUsed + toBase;
        const prevPlanTotalUsed = currentPlanTotalUsed;
        const newPlanTotalUsed = currentPlanTotalUsed + toBase;
        const prevAddonPool = (sub.addonLiveMinutesPool || 0) + toAddon;
        const newAddonPool = Math.max(0, (sub.addonLiveMinutesPool || 0) - toAddon);

        // Case 1: Daily plan limit reached and no add-on live minutes available (Single-time per day)
        const dailyExhaustedNow = hasDailyLimit && prevDailyUsed < rawDailyLimit && newDailyUsed >= rawDailyLimit;
        if (dailyExhaustedNow && newAddonPool <= 0) {
          const freshUsage = await LiveUsage.findOne({ parentUserId: session.parentUserId, dayKey });
          if (!freshUsage?.dailyLimitNotified) {
            await LiveUsage.updateOne(
              { parentUserId: session.parentUserId, dayKey },
              { $set: { dailyLimitNotified: true } }
            );
            await sendLocalizedFcmTopicNotification(
              `parent_${session.parentUserId}`,
              'LIVE_DAILY_LIMIT_REACHED',
              {},
              undefined,
              { type: 'live_daily_limit_reached' }
            );
            console.log(`[LIVE-NOTIF] Sent single-time LIVE_DAILY_LIMIT_REACHED notification to parent_${session.parentUserId}`);
          }
        }

        // Case 2: Total plan limit reached and no add-on live minutes available (Single-time per plan subscription)
        const totalPlanExhaustedNow = hasTotalLimit && prevPlanTotalUsed < planTotalLimit && newPlanTotalUsed >= planTotalLimit;
        if (totalPlanExhaustedNow && newAddonPool <= 0) {
          const freshSub = await Subscription.findOne({ parentUserId: session.parentUserId });
          if (freshSub && !freshSub.liveTotalLimitNotified) {
            await Subscription.updateOne(
              { parentUserId: session.parentUserId },
              { $set: { liveTotalLimitNotified: true } }
            );
            await sendLocalizedFcmTopicNotification(
              `parent_${session.parentUserId}`,
              'LIVE_TOTAL_LIMIT_REACHED',
              {},
              undefined,
              { type: 'live_total_limit_reached' }
            );
            console.log(`[LIVE-NOTIF] Sent single-time LIVE_TOTAL_LIMIT_REACHED notification to parent_${session.parentUserId}`);
          }
        }

        // Case 3: Live minutes ADD-ON booster plan minutes exhausted (Single-time per booster pool)
        if (prevAddonPool > 0 && newAddonPool <= 0) {
          const freshSub = await Subscription.findOne({ parentUserId: session.parentUserId });
          if (freshSub && !freshSub.addonLiveExhaustedNotified) {
            await Subscription.updateOne(
              { parentUserId: session.parentUserId },
              { $set: { addonLiveExhaustedNotified: true } }
            );
            await sendLocalizedFcmTopicNotification(
              `parent_${session.parentUserId}`,
              'LIVE_ADDON_EXHAUSTED',
              {},
              undefined,
              { type: 'live_addon_exhausted' }
            );
            console.log(`[LIVE-NOTIF] Sent single-time LIVE_ADDON_EXHAUSTED notification to parent_${session.parentUserId}`);
          }
        }
      }
    } catch (notifErr: any) {
      console.error(`[LIVE-NOTIF-ERROR] ${notifErr?.message}`);
    }

    return minutesToCharge;
  }

  /**
   * Cancel session without charging (e.g. device offline, screen off, or recording in progress)
   */
  public static cancelSession(sessionId?: string, deviceId?: string, socketId?: string): void {
    const session = this.findSession(sessionId, deviceId, socketId);
    if (!session) return;

    session.isEnded = true;
    if (session.cutoffTimer) {
      clearTimeout(session.cutoffTimer);
      session.cutoffTimer = undefined;
    }
    this.cleanupSessionReferences(session);
    console.log(`[LIVE-USAGE-CANCEL] Session ${session.sessionId} canceled without charges.`);
  }

  public static findSession(sessionId?: string, deviceId?: string, socketId?: string): ActiveLiveSession | undefined {
    if (sessionId && this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }
    if (deviceId && this.deviceToSession.has(deviceId)) {
      const sId = this.deviceToSession.get(deviceId)!;
      return this.activeSessions.get(sId);
    }
    if (socketId && this.socketToSession.has(socketId)) {
      const sId = this.socketToSession.get(socketId)!;
      return this.activeSessions.get(sId);
    }
    return undefined;
  }

  public static findBySocket(socketId: string): ActiveLiveSession | undefined {
    if (this.socketToSession.has(socketId)) {
      const sId = this.socketToSession.get(socketId)!;
      return this.activeSessions.get(sId);
    }
    return undefined;
  }

  private static cleanupSessionReferences(session: ActiveLiveSession): void {
    this.activeSessions.delete(session.sessionId);
    if (this.deviceToSession.get(session.deviceId) === session.sessionId) {
      this.deviceToSession.delete(session.deviceId);
    }
    if (session.rawDeviceId && this.deviceToSession.get(session.rawDeviceId) === session.sessionId) {
      this.deviceToSession.delete(session.rawDeviceId);
    }
    if (this.socketToSession.get(session.parentSocketId) === session.sessionId) {
      this.socketToSession.delete(session.parentSocketId);
    }
    if (session.childSocketId && this.socketToSession.get(session.childSocketId) === session.sessionId) {
      this.socketToSession.delete(session.childSocketId);
    }
  }
}
