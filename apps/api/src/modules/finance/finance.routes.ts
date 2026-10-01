import { Router } from 'express';
import { z } from 'zod';
import * as c from './finance.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  financeCategorySchema,
  financeCategoryQuerySchema,
  revenueCreateSchema,
  revenueUpdateSchema,
  revenueQuerySchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseQuerySchema,
  assetCreateSchema,
  assetUpdateSchema,
  assetQuerySchema,
  liabilityCreateSchema,
  liabilityUpdateSchema,
  liabilityQuerySchema,
  dateRangeSchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });
const yearMonth = z.object({ year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12).optional() });
const yearOnly = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

r.use(authenticate, requireShopContext);

const view = requirePermission('FINANCE_VIEW');
const create = requirePermission('FINANCE_CREATE');
const update = requirePermission('FINANCE_UPDATE');
const remove = requirePermission('FINANCE_DELETE');

r.post('/categories', create, validateRequest({ body: financeCategorySchema }), c.createCategory);
r.get('/categories', view, validateRequest({ query: financeCategoryQuerySchema }), c.listCategories);

function crud(path: string, ctrl: { create: unknown; list: unknown; update: unknown; remove: unknown }, schemas: { create: z.ZodTypeAny; update: z.ZodTypeAny; query: z.ZodTypeAny }) {
  const router = Router();
  router.post('/', create, validateRequest({ body: schemas.create }), ctrl.create as never);
  router.get('/', view, validateRequest({ query: schemas.query }), ctrl.list as never);
  router.patch('/:id', update, validateRequest({ params: uuidParam, body: schemas.update }), ctrl.update as never);
  router.delete('/:id', remove, validateRequest({ params: uuidParam }), ctrl.remove as never);
  r.use(path, router);
}

crud('/revenues', c.revenueCtrl, { create: revenueCreateSchema, update: revenueUpdateSchema, query: revenueQuerySchema });
crud('/expenses', c.expenseCtrl, { create: expenseCreateSchema, update: expenseUpdateSchema, query: expenseQuerySchema });
crud('/assets', c.assetCtrl, { create: assetCreateSchema, update: assetUpdateSchema, query: assetQuerySchema });
crud('/liabilities', c.liabilityCtrl, { create: liabilityCreateSchema, update: liabilityUpdateSchema, query: liabilityQuerySchema });

r.get('/dashboard', view, validateRequest({ query: dateRangeSchema }), c.dashboard);
r.get('/cash-flow', view, validateRequest({ query: dateRangeSchema }), c.cashFlow);
r.get('/profit-loss', view, validateRequest({ query: dateRangeSchema }), c.profitLoss);
r.get('/revenue-analysis', view, validateRequest({ query: dateRangeSchema }), c.revenueAnalysis);
r.get('/reports/monthly', view, validateRequest({ query: yearMonth }), c.monthlyReport);
r.get('/reports/yearly', view, validateRequest({ query: yearOnly }), c.yearlyReport);
r.get('/reports/tax', view, validateRequest({ query: dateRangeSchema }), c.taxReport);

export default r;
