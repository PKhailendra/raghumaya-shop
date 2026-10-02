import { Router } from 'express';
import { z } from 'zod';
import * as c from './expenses.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  expenseTrackerCreateSchema,
  expenseTrackerUpdateSchema,
  expenseTrackerQuerySchema,
  expenseTrackerSummarySchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContext);

const view = requirePermission('FINANCE_VIEW');
const create = requirePermission('FINANCE_CREATE');
const update = requirePermission('FINANCE_UPDATE');
const remove = requirePermission('FINANCE_DELETE');

r.get('/summary', view, validateRequest({ query: expenseTrackerSummarySchema }), c.summary);
r.get('/categories', view, c.categories);
r.get('/', view, validateRequest({ query: expenseTrackerQuerySchema }), c.list);
r.post('/', create, validateRequest({ body: expenseTrackerCreateSchema }), c.create);
r.patch('/:id', update, validateRequest({ params: uuidParam, body: expenseTrackerUpdateSchema }), c.update);
r.delete('/:id', remove, validateRequest({ params: uuidParam }), c.remove);

export default r;
