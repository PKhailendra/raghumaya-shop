import type { NextFunction, Request, Response } from 'express';
import { getRedis } from './redis';
import type { Actor } from '@raghumaya/shared';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
  }
}

const memoryStore = new Map<string, { status: number; body: unknown; expiresAt: number }>();
const TTL_SECONDS = 24 * 3600;

function scopeKey(req: Request, key: string): string {
  const actor = req.actor;
  const actorPart = actor ? `${actor.actorType}:${actor.accountId ?? actor.adminId}` : 'anon';
  return `idem:${actorPart}:${req.baseUrl}${req.path}:${key}`;
}

async function storeGet(key: string): Promise<{ status: number; body: unknown } | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as { status: number; body: unknown }) : null;
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return { status: entry.status, body: entry.body };
}

async function storeSet(key: string, value: { status: number; body: unknown }): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(key, JSON.stringify(value), 'EX', TTL_SECONDS);
    return;
  }
  memoryStore.set(key, { ...value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

/**
 * Honor the Idempotency-Key header on POST routes. Replays the stored
 * response when the same key is seen again (per actor + route).
 */
export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.get('Idempotency-Key')?.trim();
      if (!key || req.method !== 'POST') {
        next();
        return;
      }
      const cacheKey = scopeKey(req, key);
      const cached = await storeGet(cacheKey);
      if (cached) {
        res.status(cached.status).json(cached.body);
        return;
      }
      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode < 500) {
          void storeSet(cacheKey, { status: res.statusCode, body }).catch(() => undefined);
        }
        return originalJson(body);
      }) as typeof res.json;
      next();
    } catch {
      next();
    }
  };
}
