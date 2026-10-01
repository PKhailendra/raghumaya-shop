import { Router } from 'express';
import { z } from 'zod';
import * as c from './subscriptions.controller';
import { authenticate, requireShopContext, requirePermission, requireAdmin } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { paginationSchema, subscriptionChangeSchema, subscriptionCancelSchema, subscriptionAssignSchema } from '@raghumaya/shared';

const r = Router();

r.get('/plans', validateRequest({ query: z.object({ activeOnly: z.coerce.boolean().default(true) }) }), c.getPlans);

r.use(authenticate);

const view = requirePermission('SUBSCRIPTION_VIEW');
const manage = requirePermission('SUBSCRIPTION_MANAGE');

/* shop-scoped (plan catalog is public) */
const shop = Router();
shop.use(requireShopContext);
shop.get('/current', view, c.getCurrent);
shop.get('/history', view, validateRequest({ query: paginationSchema }), c.getHistory);
shop.get('/limits', view, c.getLimits);
shop.get('/features', view, c.getFeatures);
shop.post('/change', manage, validateRequest({ body: subscriptionChangeSchema }), c.changePlan);
shop.post('/cancel', manage, validateRequest({ body: subscriptionCancelSchema }), c.cancelSubscription);
r.use('/', shop);

/* platform admin */
r.post('/admin/assign', requireAdmin, validateRequest({ body: subscriptionAssignSchema.extend({ shopId: z.string().uuid() }) }), c.adminAssign);

export default r;
