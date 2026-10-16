import { LiveUsage } from '../models/LiveUsage';
import { Subscription } from '../models/Subscription';
import { getSignalingIo } from '../signaling/webrtc.signaling';
import { ConfigService } from './ConfigService';

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
   * Check remaining live minutes (daily plan limit + add-on booster pool)
   */
  public static async getRemainingLiveMinutes(parentUserId: string): Promise<{
    hasSubscription: boolean;
    isExpired: boolean;
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
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
        addonPoolRemaining: 0,
        totalRemaining: 0,
        sub,
      };
    }

    const now = new Date();
    const dayKey = this.getDayKey(now);
    const dailyLimit = sub.planSnapshot?.liveLimitPerDay || 15;
    const addonPoolRemaining = Math.max(0, sub.addonLiveMinutesPool || 0);

    const liveUsage = await LiveUsage.findOne({ parentUserId, dayKey });
    const dailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const totalRemaining = dailyRemaining + addonPoolRemaining;

    return {
      hasSubscription: true,
      isExpired: false,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
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

    if (remaining.totalRemaining <= 0) {
      return {
        allowed: false,
        allowedMinutes: 0,
        reason: 'LIVE_MINUTES_EXCEEDED',
        message: 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.',
        canRetry: false,
      };
    }

    // Per-session limit cap strictly from ConfigService based on session/feature type
    const options = await ConfigService.getMergedOptions();
    let perSessionCap = 5;

    const sessionType = (type || '').toLowerCase();
    if (sessionType.includes('audio') || sessionType.includes('mic')) {
      perSessionCap = Number(options.liveAudioPerSessionLimitMin) || 5;
    } else if (sessionType.includes('screen') || sessionType.includes('mirror')) {
      perSessionCap = Number(options.liveScreenMirrorPerSessionLimitMin) || 5;
    } else {
      // video, camera, or default
      perSessionCap = Number(options.liveVideoPerSessionLimitMin) || Number(options.liveSessionMaxMin) || 5;
    }

    const sessionAllowedMinutes = perSessionCap > 0
      ? Math.min(remaining.totalRemaining, perSessionCap)
      : remaining.totalRemaining;
    const limitedBySessionCap = perSessionCap > 0 && perSessionCap < remaining.totalRemaining;

    if (sessionAllowedMinutes <= 0) {
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
    const reason = isSessionCap ? 'SESSION_LIMIT_REACHED' : 'LIVE_MINUTES_EXCEEDED';
    const message = isSessionCap
      ? 'Per-session live limit reached. Tap Try Again to start a new session.'
      : 'Daily live limit & booster minutes exhausted. Buy a booster or try again tomorrow.';
    const canRetry = isSessionCap;

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
      }
    } catch (e: any) {
      console.error(`[LIVE-USAGE-CUTOFF-EMIT-ERR] ${e?.message}`);
    }

    // Also send FCM push notification to parent topic so notification shows when app is closed / in background
    try {
      if (session.parentUserId) {
        const { sendFcmTopicNotification } = require('./fcm.service');
        const sessionTitle = isSessionCap ? 'Live Stream Limit Reached' : 'Daily Live Minutes Exhausted';
        sendFcmTopicNotification(
          `parent_${session.parentUserId}`,
          sessionTitle,
          message,
          {
            type: reason,
            sessionId: session.sessionId,
            deviceId: session.deviceId,
            streamType: session.type || 'camera',
          }
        ).catch((err: any) => console.warn('[FCM-CUTOFF-WARN]', err?.message));
      }
    } catch (pushErr: any) {
      console.warn('[LIVE-USAGE-CUTOFF-FCM-ERR]', pushErr?.message);
    }

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

    // Compute elapsed duration
    const startTime = session.mediaStartedAt || session.startedAt;
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
    // 1. Fetch current daily usage to compute available daily bucket
    const now = new Date();
    const dayKey = session.dayKey || this.getDayKey(now);
    const monthKey = this.getMonthKey(now);

    let liveUsage = await LiveUsage.findOne({ parentUserId: session.parentUserId, dayKey });
    const currentDailyUsed = liveUsage ? (liveUsage.dailyMinutesUsed || 0) : 0;
    const dailyCapacity = Math.max(0, session.dailyPlanLimit - currentDailyUsed);

    const toDaily = Math.min(minutesToCharge, dailyCapacity);
    const toAddon = minutesToCharge - toDaily;

    console.log(`[LIVE-USAGE-SPLIT] Session ${session.sessionId}: Total=${minutesToCharge} min -> Daily=${toDaily} min, AddonPool=${toAddon} min`);

    // 2. Atomic $inc on LiveUsage
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    await LiveUsage.findOneAndUpdate(
      { parentUserId: session.parentUserId, dayKey },
      {
        $inc: {
          dailyMinutesUsed: toDaily,
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

    // 3. Atomic deduction from Subscription.addonLiveMinutesPool if overflow consumed from addon pool
    if (toAddon > 0) {
      await Subscription.updateOne(
        { parentUserId: session.parentUserId },
        {
          $inc: { addonLiveMinutesPool: -toAddon },
        }
      );
      // Clamp pool to zero if it ever became negative
      await Subscription.updateOne(
        { parentUserId: session.parentUserId, addonLiveMinutesPool: { $lt: 0 } },
        { $set: { addonLiveMinutesPool: 0 } }
      );
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
