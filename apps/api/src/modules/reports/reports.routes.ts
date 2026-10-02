import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as c from './reports.controller';
import { authenticate, requireShopContext, isPlatformAdmin } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { HttpError } from '../../middleware/errorHandler';
import type { ShopPermission } from '@raghumaya/shared';

const r = Router();

r.use(authenticate, requireShopContext);

/**
 * OR-permission gate: OWNER and platform admins bypass; others need at least
 * one of the listed permissions. (requirePermission() is AND-only.)
 */
function requireAnyPermission(...perms: ShopPermission[]) {
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
    if (perms.some((p) => held.has(p))) {
      next();
      return;
    }
    next(new HttpError(403, 'FORBIDDEN', `Missing permissions: need one of ${perms.join(', ')}`));
  };
}

const view = requireAnyPermission('ANALYTICS_VIEW', 'FINANCE_VIEW');

const dailyClosingQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
});

r.get('/daily-closing', view, validateRequest({ query: dailyClosingQuerySchema }), c.dailyClosing);

export default r;
