import { Router } from 'express';
import { z } from 'zod';
import * as c from './purchases.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { idempotency } from '../../lib/idempotency';
import { purchaseCreateSchema, purchaseUpdateSchema, paginationSchema } from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContext);

const view = requirePermission('STOCK_VIEW');
const adjust = requirePermission('STOCK_ADJUST');

r.post('/', adjust, idempotency(), validateRequest({ body: purchaseCreateSchema }), c.createPurchase);
r.get('/', view, validateRequest({ query: paginationSchema.extend({ search: z.string().trim().max(100).optional(), supplierId: z.string().uuid().optional(), fromDate: z.string().optional(), toDate: z.string().optional() }) }), c.listPurchases);
r.get('/:id', view, validateRequest({ params: uuidParam }), c.getPurchase);
r.patch('/:id', adjust, validateRequest({ params: uuidParam, body: purchaseUpdateSchema }), c.updatePurchase);

export default r;
