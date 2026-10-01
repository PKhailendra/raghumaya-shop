import { Router } from 'express';
import { z } from 'zod';
import * as c from './analytics.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { dateRangeSchema, analyticsQuerySchema } from '@raghumaya/shared';

const r = Router();

r.use(authenticate, requireShopContext);

const view = requirePermission('ANALYTICS_VIEW');
const groupBySchema = analyticsQuerySchema.extend({ groupBy: z.enum(['day', 'week', 'month']).optional() });
const perfSchema = analyticsQuerySchema.extend({
  sortBy: z.enum(['revenue', 'quantity', 'margin']).optional(),
});

r.get('/dashboard', view, validateRequest({ query: dateRangeSchema }), c.dashboard);
r.get('/sales-summary', view, validateRequest({ query: dateRangeSchema }), c.salesSummary);
r.get('/sales-chart', view, validateRequest({ query: groupBySchema }), c.salesChart);
r.get('/top-products', view, validateRequest({ query: analyticsQuerySchema }), c.topProducts);
r.get('/top-categories', view, validateRequest({ query: analyticsQuerySchema }), c.topCategories);
r.get('/customer-insights', view, validateRequest({ query: dateRangeSchema }), c.customerInsights);
r.get('/payment-analysis', view, validateRequest({ query: dateRangeSchema }), c.paymentAnalysis);
r.get('/inventory-insights', view, c.inventoryInsights);
r.get('/profit-analysis', view, validateRequest({ query: dateRangeSchema }), c.profitAnalysis);
r.get('/revenue-by-payment-method', view, validateRequest({ query: dateRangeSchema }), c.revenueByPaymentMethod);
r.get('/customer-growth', view, validateRequest({ query: dateRangeSchema }), c.customerGrowth);
r.get('/product-performance', view, validateRequest({ query: perfSchema }), c.productPerformance);
r.get('/staff-performance', view, validateRequest({ query: dateRangeSchema }), c.staffPerformance);

export default r;
