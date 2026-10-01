import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/crypto';
import { SHOP_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, type Actor, type ShopPermission } from '@raghumaya/shared';
import { HttpError } from './errorHandler';

const ALL_PERMISSIONS = [...SHOP_PERMISSIONS] as ShopPermission[];

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.get('authorization') ?? '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
    const payload = verifyAccessToken(match[1]);

    if (payload.actorType === 'admin') {
      const admin = await prisma.admin.findFirst({
        where: { id: payload.adminId, deletedAt: null },
      });
      if (!admin) throw new HttpError(401, 'UNAUTHORIZED', 'Admin not found');
      if (admin.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_BLOCKED', `Admin account is ${admin.status}`);
      const actor: Actor = {
        actorType: 'admin',
        adminId: admin.id,
        adminRole: admin.role,
        permissions: [],
      };
      req.actor = actor;
      next();
      return;
    }

    const account = await prisma.account.findFirst({
      where: { id: payload.accountId, deletedAt: null },
    });
    if (!account) throw new HttpError(401, 'UNAUTHORIZED', 'Account not found');
    if (account.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_BLOCKED', `Account is ${account.status}`);

    const actor: Actor = {
      actorType: 'account',
      accountId: account.id,
      activeShopId: payload.activeShopId ?? null,
      role: null,
      permissions: [],
    };

    if (payload.activeShopId) {
      const membership = await prisma.shopMembership.findFirst({
        where: { shopId: payload.activeShopId, accountId: account.id, deletedAt: null },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new HttpError(403, 'SHOP_ACCESS_DENIED', 'No active membership for this shop');
      }
      actor.role = membership.role;
      // Legacy memberships may carry an empty permission list → fall back to role defaults
      const stored = [...(membership.permissions as string[] | null ?? [])];
      actor.permissions =
        membership.role === 'OWNER'
          ? ALL_PERMISSIONS
          : (stored.length > 0 ? stored : (DEFAULT_ROLE_PERMISSIONS[membership.role as Exclude<typeof membership.role, 'OWNER'>] ?? [])) as ShopPermission[];
    }

    req.actor = actor;
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

/** Require an authenticated platform admin (any admin role). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (!actor || actor.actorType !== 'admin') {
    next(new HttpError(403, 'FORBIDDEN', 'Platform admin access required'));
    return;
  }
  next();
}

/** Require a super admin specifically. */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (!actor || actor.actorType !== 'admin' || actor.adminRole !== 'SUPER_ADMIN') {
    next(new HttpError(403, 'FORBIDDEN', 'Super admin access required'));
    return;
  }
  next();
}

/** Require the request to carry an active shop context (shop users). */
export function requireShopContext(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (!actor || actor.actorType !== 'account' || !actor.activeShopId) {
    next(new HttpError(400, 'SHOP_CONTEXT_REQUIRED', 'Select a shop first (POST /api/v1/shops/switch)'));
    return;
  }
  next();
}

/**
 * Shop context OR platform admin. Lets SUPER_ADMIN/ADMIN use shop-scoped
 * routers (notifications, audit logs) across all shops; services then
 * scope by activeShopId only when present.
 */
export function requireShopContextOrAdmin(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (isPlatformAdmin(actor)) {
    next();
    return;
  }
  requireShopContext(req, _res, next);
}

function isPlatformAdmin(actor: Actor | undefined): boolean {
  return !!actor && actor.actorType === 'admin' && (actor.adminRole === 'SUPER_ADMIN' || actor.adminRole === 'ADMIN');
}

/**
 * Role gate for shop routes. Platform SUPER_ADMIN/ADMIN always pass.
 * Shop users must hold one of the given membership roles.
 */
export function authorizeRoles(...roles: Array<'OWNER' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT' | 'INVENTORY_STAFF' | 'STAFF'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = req.actor;
    if (!actor) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (isPlatformAdmin(actor)) {
      next();
      return;
    }
    if (actor.actorType === 'account' && actor.role && (roles as string[]).includes(actor.role)) {
      next();
      return;
    }
    next(new HttpError(403, 'FORBIDDEN', `Requires one of roles: ${roles.join(', ')}`));
  };
}

/**
 * Permission gate using granular ShopPermission keys. OWNER and platform
 * SUPER_ADMIN/ADMIN bypass; others need every listed permission.
 */
export function requirePermission(...perms: ShopPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = req.actor;
    if (!actor) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (isPlatformAdmin(actor)) {
      next();
      return;
    }
    if (actor.actorType === 'account' && actor.role === 'OWNER') {
      next();
      return;
    }
    const held = new Set(actor.permissions ?? []);
    const missing = perms.filter((p) => !held.has(p));
    if (missing.length > 0) {
      next(new HttpError(403, 'FORBIDDEN', `Missing permissions: ${missing.join(', ')}`));
      return;
    }
    next();
  };
}
