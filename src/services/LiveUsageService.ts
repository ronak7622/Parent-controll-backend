import { LiveUsage } from '../models/LiveUsage';
import { Subscription } from '../models/Subscription';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { getRedisClient } from './cache.service';
import { ConfigService } from './ConfigService';
import { sendLocalizedFcmTopicNotification } from './fcm.service';
import { DEFAULT_TZ_OFFSET_MINUTES, getDateStringInTimeZone, getDayBounds } from '../utils/date.utils';

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
  private static sweepTimer: NodeJS.Timeout | null = null;

  private static readonly REDIS_SESS_PREFIX = 'live:sess:';
  private static readonly REDIS_DEV_PREFIX = 'live:dev:';
  private static readonly REDIS_SOCK_PREFIX = 'live:sock:';
  private static readonly REDIS_ACTIVE_SET = 'live:active_ids';
  private static readonly REDIS_ENDED_PREFIX = 'live:ended:';

  private static serializeSession(s: ActiveLiveSession): string {
    return JSON.stringify({
      sessionId: s.sessionId,
      parentUserId: s.parentUserId,
      deviceId: s.deviceId,
      rawDeviceId: s.rawDeviceId,
      parentSocketId: s.parentSocketId,
      childSocketId: s.childSocketId,
      type: s.type,
      startedAtMs: s.startedAt.getTime(),
      mediaStartedAtMs: s.mediaStartedAt ? s.mediaStartedAt.getTime() : null,
      allowedMinutes: s.allowedMinutes,
      dailyPlanLimit: s.dailyPlanLimit,
      dayKey: s.dayKey,
      limitedBySessionCap: s.limitedBySessionCap,
      willExhaustPlanTotal: s.willExhaustPlanTotal,
      isEnded: Boolean(s.isEnded),
    });
  }

  private static deserializeSession(raw: string): ActiveLiveSession | null {
    try {
      const p = JSON.parse(raw);
      return {
        sessionId: p.sessionId,
        parentUserId: p.parentUserId,
        deviceId: p.deviceId,
        rawDeviceId: p.rawDeviceId,
        parentSocketId: p.parentSocketId,
        childSocketId: p.childSocketId,
        type: p.type,
        startedAt: new Date(p.startedAtMs),
        mediaStartedAt: p.mediaStartedAtMs ? new Date(p.mediaStartedAtMs) : undefined,
        allowedMinutes: p.allowedMinutes,
        dailyPlanLimit: p.dailyPlanLimit,
        dayKey: p.dayKey,
        limitedBySessionCap: Boolean(p.limitedBySessionCap),
        willExhaustPlanTotal: Boolean(p.willExhaustPlanTotal),
        isEnded: Boolean(p.isEnded),
      };
    } catch {
      return null;
    }
  }

  private static async persistSessionToRedis(s: ActiveLiveSession): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      const ttl = Math.max((s.allowedMinutes || 60) * 60 + 300, 600);
      const multi = redis.multi();
      multi.set(`${this.REDIS_SESS_PREFIX}${s.sessionId}`, this.serializeSession(s), 'EX', ttl);
      multi.set(`${this.REDIS_DEV_PREFIX}${s.deviceId}`, s.sessionId, 'EX', ttl);
      if (s.rawDeviceId && s.rawDeviceId !== s.deviceId) {
        multi.set(`${this.REDIS_DEV_PREFIX}${s.rawDeviceId}`, s.sessionId, 'EX', ttl);
      }
      if (s.parentSocketId) {
        multi.set(`${this.REDIS_SOCK_PREFIX}${s.parentSocketId}`, s.sessionId, 'EX', ttl);
      }
      if (s.childSocketId) {
        multi.set(`${this.REDIS_SOCK_PREFIX}${s.childSocketId}`, s.sessionId, 'EX', ttl);
      }
      multi.sadd(this.REDIS_ACTIVE_SET, s.sessionId);
      await multi.exec();
    } catch (err: any) {
      console.warn('[LIVE-REDIS-PERSIST-WARN]', err?.message);
    }
  }

  private static async removeSessionFromRedis(s: ActiveLiveSession): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      const keys = [
        `${this.REDIS_SESS_PREFIX}${s.sessionId}`,
        `${this.REDIS_DEV_PREFIX}${s.deviceId}`,
      ];
      if (s.rawDeviceId && s.rawDeviceId !== s.deviceId) {
        keys.push(`${this.REDIS_DEV_PREFIX}${s.rawDeviceId}`);
      }
      if (s.parentSocketId) keys.push(`${this.REDIS_SOCK_PREFIX}${s.parentSocketId}`);
      if (s.childSocketId) keys.push(`${this.REDIS_SOCK_PREFIX}${s.childSocketId}`);
      await redis.del(...keys);
      await redis.srem(this.REDIS_ACTIVE_SET, s.sessionId);
    } catch (_) {}
  }

  private static async findSessionFromRedis(key: string): Promise<ActiveLiveSession | undefined> {
    const redis = getRedisClient();
    if (!redis || !key) return undefined;
    try {
      let raw = await redis.get(`${this.REDIS_SESS_PREFIX}${key}`);
      if (!raw) {
        const mappedId =
          (await redis.get(`${this.REDIS_DEV_PREFIX}${key}`)) ||
          (await redis.get(`${this.REDIS_SOCK_PREFIX}${key}`));
        if (mappedId) {
          raw = await redis.get(`${this.REDIS_SESS_PREFIX}${mappedId}`);
        }
      }
      if (!raw) return undefined;
      return this.deserializeSession(raw) || undefined;
    } catch {
      return undefined;
    }
  }

  private static async claimEndLock(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) return true;
    try {
      const res = await redis.set(`${this.REDIS_ENDED_PREFIX}${sessionId}`, '1', 'EX', 300, 'NX');
      return res === 'OK';
    } catch {
      return true;
    }
  }

  private static ensureSweepStarted(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(async () => {
      const redis = getRedisClient();
      if (!redis) return;
      try {
        const ids = await redis.smembers(this.REDIS_ACTIVE_SET);
        if (!ids || ids.length === 0) return;
        const nowMs = Date.now();
        for (const id of ids) {
          const raw = await redis.get(`${this.REDIS_SESS_PREFIX}${id}`);
          if (!raw) {
            await redis.srem(this.REDIS_ACTIVE_SET, id);
            continue;
          }
          const s = this.deserializeSession(raw);
          if (!s || s.isEnded) {
            await redis.srem(this.REDIS_ACTIVE_SET, id);
            continue;
          }
          if (s.mediaStartedAt) {
            const cutoffAt = s.mediaStartedAt.getTime() + s.allowedMinutes * 60 * 1000;
            if (nowMs >= cutoffAt) {
              if (!this.activeSessions.has(s.sessionId)) {
                this.activeSessions.set(s.sessionId, s);
              }
              await this.cutoffSession(s.sessionId);
            }
          } else if (nowMs - s.startedAt.getTime() > 90_000) {
            await this.cancelSession(s.sessionId, s.deviceId, s.parentSocketId);
          }
        }
      } catch (_) {}
    }, 15_000);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  /**
   * Helper to format today's day key ("YYYY-MM-DD") in default timezone (Asia/Kolkata)
   * so daily resets do not depend on the host server OS timezone.
   */
  public static getDayKey(date: Date = new Date()): string {
    return getDateStringInTimeZone(date);
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

    // 0. Plan feature flag check (isAllowLiveFeatures === false disables live features)
    if (sub.planSnapshot?.isAllowLiveFeatures === false) {
      return {
        hasSubscription: true,
        isExpired: false,
        dailyLimit: 0,
        dailyUsed: 0,
        dailyRemaining: 0,
        planTotalLimit: 0,
        planTotalUsed: 0,
        planTotalRemaining: 0,
        basePlanRemainingToday: 0,
        addonPoolRemaining: Math.max(0, sub.addonLiveMinutesPool || 0),
        totalRemaining: 0,
        sub,
      };
    }

    // 1. Overall Plan Cumulative Live Limit (0 = disabled, -1 = unlimited)
    const planTotalLimit = Number(sub.planSnapshot?.liveLimitTotalInMinute ?? sub.planSnapshot?.liveMinutesTotal ?? 0);
    const planTotalUsed = Number(sub.planLiveMinutesUsed ?? 0);
    const isUnlimitedTotal = planTotalLimit < 0;
    const planTotalRemaining = isUnlimitedTotal ? Infinity : Math.max(0, planTotalLimit - planTotalUsed);

    // 2. Daily Plan Limit (0 = disabled, -1 = unlimited)
    const rawDailyLimit = Number(sub.planSnapshot?.liveLimitPerDayInMinutes ?? sub.planSnapshot?.liveLimitPerDay ?? 0);
    const isUnlimitedDaily = rawDailyLimit < 0;

    const liveUsage = await LiveUsage.findOne({ parentUserId, dayKey });
    const dailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyRemaining = isUnlimitedDaily ? Infinity : Math.max(0, rawDailyLimit - dailyUsed);

    // 3. Base plan minutes remaining today:
    let basePlanRemainingToday = 0;
    if (!isUnlimitedDaily && !isUnlimitedTotal) {
      basePlanRemainingToday = Math.min(dailyRemaining, planTotalRemaining);
    } else if (!isUnlimitedDaily) {
      basePlanRemainingToday = dailyRemaining;
    } else if (!isUnlimitedTotal) {
      basePlanRemainingToday = planTotalRemaining;
    } else {
      basePlanRemainingToday = 999999;
    }

    const addonPoolRemaining = Math.max(0, sub.addonLiveMinutesPool || 0);
    const totalRemaining = (basePlanRemainingToday === Infinity ? 999999 : basePlanRemainingToday) + addonPoolRemaining;

    return {
      hasSubscription: true,
      isExpired: false,
      dailyLimit: rawDailyLimit > 0 ? rawDailyLimit : (planTotalLimit > 0 ? planTotalLimit : 0),
      dailyUsed,
      dailyRemaining: basePlanRemainingToday === Infinity ? 999999 : basePlanRemainingToday,
      planTotalLimit,
      planTotalUsed,
      planTotalRemaining: isUnlimitedTotal ? 999999 : planTotalRemaining,
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

    if (remaining.sub?.planSnapshot?.isAllowLiveFeatures === false) {
      return {
        allowed: false,
        allowedMinutes: 0,
        reason: 'LIVE_FEATURE_NOT_ALLOWED',
        message: 'Live streaming is not included in your current plan. Upgrade to unlock Live Screen, Camera & Audio.',
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

    // Do NOT start the per-session cutoffTimer here before media connects;
    // it starts in markMediaConnected() so failed/unconnected attempts never trigger SESSION_LIMIT_REACHED.
    // Safety net: if media never connects within 60s, clean up the pending session silently.
    const cutoffDurationMs = sessionAllowedMinutes * 60 * 1000;
    session.cutoffTimer = setTimeout(() => {
      const s = this.activeSessions.get(sessionId);
      if (s && !s.mediaStartedAt && !s.isEnded) {
        console.log(`[LIVE-USAGE-CLEANUP] Pending session ${sessionId} never connected within 60s; cancelling silently.`);
        this.cancelSession(sessionId, deviceId, parentSocketId);
      }
    }, 60_000);

    this.activeSessions.set(sessionId, session);
    this.deviceToSession.set(deviceId, sessionId);
    if (rawDeviceId && rawDeviceId !== deviceId) {
      this.deviceToSession.set(rawDeviceId, sessionId);
    }
    this.socketToSession.set(parentSocketId, sessionId);
    this.ensureSweepStarted();
    await this.persistSessionToRedis(session);

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
      if (session.cutoffTimer) {
        clearTimeout(session.cutoffTimer);
      }
      const cutoffDurationMs = session.allowedMinutes * 60 * 1000;
      session.cutoffTimer = setTimeout(async () => {
        console.log(`[LIVE-USAGE-CUTOFF] Session ${session.sessionId} reached max allowed time (${session.allowedMinutes} min). Force stopping...`);
        await LiveUsageService.cutoffSession(session.sessionId);
      }, cutoffDurationMs);
      console.log(`[LIVE-USAGE-MEDIA] Media connected for session ${session.sessionId}. Cutoff in ${cutoffDurationMs / 1000}s`);
      this.persistSessionToRedis(session).catch(() => {});
    } else if (!session && (sessionId || deviceId)) {
      const key = sessionId || deviceId || '';
      this.findSessionFromRedis(key).then((remote) => {
        if (remote && !remote.mediaStartedAt && !remote.isEnded) {
          remote.mediaStartedAt = new Date();
          if (childSocketId) remote.childSocketId = childSocketId;
          this.activeSessions.set(remote.sessionId, remote);
          this.persistSessionToRedis(remote).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  /**
   * Cutoff timer fired: force-stops stream and consumes allowed minutes
   */
  public static async cutoffSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.isEnded || !session.mediaStartedAt) return;

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
    const session =
      this.activeSessions.get(sessionIdOrKey) ||
      (this.deviceToSession.has(sessionIdOrKey) ? this.activeSessions.get(this.deviceToSession.get(sessionIdOrKey)!) : undefined) ||
      (this.socketToSession.has(sessionIdOrKey) ? this.activeSessions.get(this.socketToSession.get(sessionIdOrKey)!) : undefined) ||
      (await this.findSessionFromRedis(sessionIdOrKey));

    if (!session) return 0;
    if (session.isEnded) {
      this.cleanupSessionReferences(session);
      await this.removeSessionFromRedis(session);
      return 0;
    }

    const gotLock = await this.claimEndLock(session.sessionId);
    if (!gotLock) {
      this.cleanupSessionReferences(session);
      return 0;
    }

    session.isEnded = true;
    if (session.cutoffTimer) {
      clearTimeout(session.cutoffTimer);
      session.cutoffTimer = undefined;
    }

    this.cleanupSessionReferences(session);
    await this.removeSessionFromRedis(session);

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
    const isUnlimitedTotal = planTotalLimit < 0;
    const planCapacity = isUnlimitedTotal ? Infinity : Math.max(0, planTotalLimit - currentPlanTotalUsed);

    const rawDailyLimit = Number(sub?.planSnapshot?.liveLimitPerDayInMinutes ?? sub?.planSnapshot?.liveLimitPerDay ?? session.dailyPlanLimit ?? 0);
    const hasDailyLimit = rawDailyLimit > 0;
    const isUnlimitedDaily = rawDailyLimit < 0;

    let liveUsage = await LiveUsage.findOne({ parentUserId: session.parentUserId, dayKey });
    const currentDailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyCapacity = isUnlimitedDaily ? Infinity : Math.max(0, rawDailyLimit - currentDailyUsed);

    // Available capacity from base plan today:
    let availableBaseCapacity = 0;
    if (!isUnlimitedDaily && !isUnlimitedTotal) {
      availableBaseCapacity = Math.min(dailyCapacity, planCapacity);
    } else if (!isUnlimitedDaily) {
      availableBaseCapacity = dailyCapacity;
    } else if (!isUnlimitedTotal) {
      availableBaseCapacity = planCapacity;
    } else {
      availableBaseCapacity = minutesToCharge;
    }

    const toBase = Math.min(minutesToCharge, Math.max(0, availableBaseCapacity));
    const toAddon = minutesToCharge - toBase;

    console.log(`[LIVE-USAGE-SPLIT] Session ${session.sessionId}: Total=${minutesToCharge} min -> BasePlan=${toBase} min, AddonPool=${toAddon} min`);

    // 2. Atomic $inc on LiveUsage for today
    const bounds = getDayBounds(now, DEFAULT_TZ_OFFSET_MINUTES);
    const nextMidnight = bounds ? new Date(bounds.end.getTime() + 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
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

    // Real-time WebSocket sync: Broadcast updated live usage to parent & device rooms
    try {
      const io = getSignalingIo();
      if (io) {
        const freshUsage = await LiveUsageService.getRemainingLiveMinutes(session.parentUserId);
        const configOpts = await ConfigService.getMergedOptions();
        const payload = {
          liveUsage: {
            dayKey,
            monthKey,
            dailyMinutesUsed: freshUsage.dailyUsed,
            dailyLimit: freshUsage.dailyLimit,
            remainingDailyMinutes: freshUsage.dailyRemaining,
            planTotalLimit: freshUsage.planTotalLimit,
            planTotalUsed: freshUsage.planTotalUsed,
            planTotalRemaining: freshUsage.planTotalRemaining,
            basePlanRemainingToday: freshUsage.basePlanRemainingToday,
            addonPool: freshUsage.addonPoolRemaining,
            remainingAddonPool: freshUsage.addonPoolRemaining,
            totalRemainingLiveMinutes: freshUsage.totalRemaining,
            liveSessionMaxMin: configOpts.liveSessionMaxMin || 5,
          },
          timestamp: Date.now(),
        };
        io.to(`user_${session.parentUserId}`).emit('live-usage-updated', payload);
        io.to(`parent_${session.parentUserId}`).emit('live-usage-updated', payload);
        if (session.deviceId) {
          io.to(session.deviceId).emit('live-usage-updated', payload);
        }
      }
    } catch (broadcastErr: any) {
      console.warn('[LIVE-USAGE-BROADCAST-WARN]', broadcastErr?.message);
    }

    return minutesToCharge;
  }

  /**
   * Cancel session without charging (e.g. device offline, screen off, or recording in progress)
   */
  public static cancelSession(sessionId?: string, deviceId?: string, socketId?: string): void {
    const session = this.findSession(sessionId, deviceId, socketId);
    if (!session) {
      const key = sessionId || deviceId || socketId || '';
      if (key) {
        this.findSessionFromRedis(key).then((remote) => {
          if (remote) {
            remote.isEnded = true;
            this.removeSessionFromRedis(remote).catch(() => {});
          }
        }).catch(() => {});
      }
      return;
    }

    session.isEnded = true;
    if (session.cutoffTimer) {
      clearTimeout(session.cutoffTimer);
      session.cutoffTimer = undefined;
    }
    this.cleanupSessionReferences(session);
    this.removeSessionFromRedis(session).catch(() => {});
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
