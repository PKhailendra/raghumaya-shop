import { Router } from 'express';
import { z } from 'zod';
import * as c from './stock.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  warehouseSchema,
  stockInSchema,
  stockOutSchema,
  stockTransferSchema,
  stockPurchaseUpdateSchema,
  salesDeductionSchema,
  stockLevelsQuerySchema,
  stockMovementsQuerySchema,
  paginationSchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContext);

const view = requirePermission('STOCK_VIEW');
const adjust = requirePermission('STOCK_ADJUST');

r.post('/warehouses', adjust, validateRequest({ body: warehouseSchema }), c.createWarehouse);
r.get('/warehouses', view, c.listWarehouses);
r.patch('/warehouses/:id', adjust, validateRequest({ params: uuidParam, body: warehouseSchema.partial() }), c.updateWarehouse);
r.delete('/warehouses/:id', adjust, validateRequest({ params: uuidParam }), c.deleteWarehouse);

r.post('/in', adjust, validateRequest({ body: stockInSchema }), c.stockIn);
r.post('/out', adjust, validateRequest({ body: stockOutSchema }), c.stockOut);
r.post('/transfers', adjust, validateRequest({ body: stockTransferSchema }), c.stockTransfer);
r.post('/purchase-update', adjust, validateRequest({ body: stockPurchaseUpdateSchema }), c.purchaseUpdate);
r.post('/sales-deduction', adjust, validateRequest({ body: salesDeductionSchema }), c.salesDeduction);

r.get('/levels', view, validateRequest({ query: stockLevelsQuerySchema }), c.listLevels);
r.get('/movements', view, validateRequest({ query: stockMovementsQuerySchema }), c.listMovements);
r.get('/alerts/low-stock', view, validateRequest({ query: paginationSchema }), c.lowStockAlerts);
r.get('/alerts/out-of-stock', view, validateRequest({ query: paginationSchema }), c.outOfStockAlerts);
r.get('/alerts/expiry', view, validateRequest({ query: paginationSchema.extend({ days: z.coerce.number().int().min(1).max(365).default(30) }) }), c.expiryAlerts);
r.post('/recalculate', adjust, validateRequest({ query: z.object({ productId: z.string().uuid().optional() }) }), c.recalculate);

export default r;
