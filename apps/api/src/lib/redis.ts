import { Redis } from 'ioredis';
import { env } from '../config/env';

let redis: Redis | null = null;
let redisAvailable = false;
let initPromise: Promise<boolean> | null = null;

/** Best-effort Redis connection. Resolves false when Redis is unreachable. */
export function initRedis(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const client = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 3000,
      });
      client.on('error', () => {
        redisAvailable = false;
      });
      await Promise.race([
        client.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), 4000)),
      ]);
      redis = client;
      redisAvailable = true;
      return true;
    } catch {
      redis = null;
      redisAvailable = false;
      return false;
    }
  })();
  return initPromise;
}

export function getRedis(): Redis | null {
  return redisAvailable ? redis : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}
