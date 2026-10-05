import Redis from 'ioredis';
import { config } from '../config/env';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis | null => {
  if (!config.flags.enableRedisCache && !config.redisUri) {
    return null;
  }

  if (!redisClient && config.redisUri) {
    try {
      redisClient = new Redis(config.redisUri, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      });

      redisClient.on('connect', () => {
        console.log('[REDIS-CACHE] Redis client connected successfully.');
      });

      redisClient.on('error', (err) => {
        console.warn('[REDIS-CACHE-WARN] Redis connection error:', err.message);
      });

      redisClient.connect().catch((err) => {
        console.warn('[REDIS-CONNECT-WARN] Unable to connect to Redis:', err.message);
      });
    } catch (err: any) {
      console.warn('[REDIS-INIT-WARN] Redis init failed:', err.message);
      redisClient = null;
    }
  }

  return redisClient;
};

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      return null;
    }
  },

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      // Non-blocking catch
    }
  },

  async del(key: string | string[]): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;
    try {
      if (Array.isArray(key) && key.length > 0) {
        await redis.del(...key);
      } else if (typeof key === 'string') {
        await redis.del(key);
      }
    } catch (err) {
      // Non-blocking catch
    }
  },

  async getOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) {
      return cached;
    }
    const fresh = await fetcher();
    if (fresh) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  },

  /**
   * Helper key generators
   */
  keys: {
    deviceRules: (deviceId: string) => `device:${deviceId}:rules`,
    deviceInfo: (deviceId: string) => `device:${deviceId}:info`,
    appLimits: (deviceId: string) => `device:${deviceId}:limits`,
    appBlocks: (deviceId: string) => `device:${deviceId}:blocks`,
  },
};
