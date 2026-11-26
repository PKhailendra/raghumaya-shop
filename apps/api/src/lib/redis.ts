import { Redis } from 'ioredis';
import { env } from '../config/env';

let redis: Redis | null = null;
let redisAvailable = false;
let initPromise: Promise<boolean> | null = null;

/** Best-effort Redis connection. Resolves false when Redis is unreachable. */
export function initRedis(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    let client: Redis | null = null;
    try {
      client = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 3000,
      });
      client.on('error', () => {
        redisAvailable = false;
      });
      // With lazyConnect:true the client does NOT connect on its own, and
      // with enableOfflineQueue:false a command sent before the connection
      // is ready is rejected immediately ("Stream isn't writeable...") —
      // so ping() alone can NEVER succeed here, even with Redis healthy.
      // That was the worker's restart loop: initRedis() always returned
      // false and the worker always exited 1. Await the connection
      // explicitly first (the race bounds it: a dead Redis fails fast
      // instead of hanging on ioredis' reconnect loop).
      await Promise.race([
        client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('redis connect timeout')), 4000),
        ),
      ]);
      await client.ping();
      redis = client;
      redisAvailable = true;
      return true;
    } catch {
      // Stop any background reconnect timers on the discarded client.
      try {
        client?.disconnect();
      } catch {
        /* ignore */
      }
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
