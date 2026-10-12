import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../services/cache.service';

/**
 * 10M-Scale Enterprise Rate Limiter
 * Keyed by user_id / deviceId to prevent CGNAT (Jio/Airtel shared public IP) blocking.
 * Backed by RedisStore when Redis is active for multi-node server fleet synchronization.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: process.env.NODE_ENV === 'development' ? 500000 : 20000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never block local development or internal testing traffic
    if (process.env.NODE_ENV === 'development') return true;
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    if (typeof ip === 'string' && (ip.includes('127.0.0.1') || ip.includes('::1') || ip.startsWith('192.168.') || ip.startsWith('10.'))) {
      return true;
    }
    return false;
  },
  validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
  passOnStoreError: true, // Fail-open on Redis hiccups to prevent blocking legitimate traffic
  store: getRedisClient()
    ? new RedisStore({
        // @ts-ignore
        sendCommand: (...args: string[]) => getRedisClient()!.call(...args),
        prefix: 'rl:',
      })
    : undefined, // MemoryStore fallback when Redis is offline
  keyGenerator: (req: any) => {
    // 1. Authenticated User ID (Highest priority to prevent header spoofing)
    if (req.user?.id || req.user?._id) return `user_${req.user.id || req.user._id}`;

    // 2. Device ID from headers, params, query, or body
    const deviceId =
      req.headers['x-device-id'] ||
      req.params?.deviceId ||
      req.query?.deviceId ||
      req.body?.deviceId;
    if (deviceId) return `device_${deviceId}`;

    // 3. Fallback to IP address for unauthenticated / anonymous requests
    return req.ip || req.headers['x-forwarded-for'] || 'unknown_ip';
  },
  message: {
    success: false,
    message: 'Too many requests from this device or account, please try again after 15 minutes.',
  },
});
