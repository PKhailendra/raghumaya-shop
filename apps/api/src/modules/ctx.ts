import type { Request } from 'express';
import type { Actor } from '@raghumaya/shared';
import { HttpError } from '../middleware/errorHandler';

export interface ReqCtx {
  actor: Actor;
  ip?: string;
  userAgent?: string;
  /** Route params (e.g. shopId for ticket creation by shop users). */
  params?: Record<string, string>;
}

export function requireActor(req: Request): Actor {
  const actor = req.actor;
  if (!actor) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  return actor;
}

export function ctxFromReq(req: Request): ReqCtx {
  return {
    actor: requireActor(req),
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    params: req.params as Record<string, string>,
  };
}

export function requireShopId(ctx: ReqCtx): string {
  const shopId = ctx.actor.activeShopId;
  if (!shopId) throw new HttpError(400, 'SHOP_CONTEXT_REQUIRED', 'Select a shop first (POST /api/v1/shops/switch)');
  return shopId;
}

/** Shop id when present; null for platform admins operating across shops. */
export function optionalShopId(ctx: ReqCtx): string | null {
  return ctx.actor.activeShopId ?? null;
}

export function actorSummaryOf(
  actorType: 'account' | 'admin',
  record: { id: string; fullName: string; email?: string | null; phone?: string | null },
  role?: string,
  activeShopId?: string | null,
) {
  return {
    actorType,
    id: record.id,
    fullName: record.fullName,
    email: record.email ?? null,
    phone: record.phone ?? null,
    role,
    activeShopId: activeShopId ?? null,
  };
}
