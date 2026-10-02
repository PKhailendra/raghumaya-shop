import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { Prisma } from '@prisma/client';
import { env, corsOrigins } from './config/env';
import { requestLogger, globalRateLimit } from './middleware/common';
import { errorHandler, HttpError } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import shopRoutes from './modules/shops/shops.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import stockRoutes from './modules/stock/stock.routes';
import purchaseRoutes from './modules/purchases/purchases.routes';
import billingRoutes from './modules/billing/billing.routes';
import customerRoutes from './modules/customers/customers.routes';
import financeRoutes from './modules/finance/finance.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import reportsRoutes from './modules/reports/reports.routes';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes';
import referralRoutes from './modules/referrals/referrals.routes';
import auditRoutes from './modules/audit/audit.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import hrRoutes from './modules/hr/hr.routes';
import expensesRoutes from './modules/expenses/expenses.routes';
import adminRoutes from './modules/admin/admin.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigins.length === 1 && corsOrigins[0] === '*' ? true : corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);
  app.use(globalRateLimit);

  // Guarantee Decimal -> string in JSON responses (Prisma.Decimal#toJSON already
  // returns a string; this replacer covers any stray Decimal instances).
  app.set('json replacer', (_key: string, value: unknown) => {
    if (value instanceof Prisma.Decimal) return value.toString();
    return value;
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'raghumaya-api', time: new Date().toISOString() }));
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', service: 'raghumaya-api', time: new Date().toISOString() }));

  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/shops', shopRoutes);
  v1.use('/inventory', inventoryRoutes);
  v1.use('/stock', stockRoutes);
  v1.use('/purchases', purchaseRoutes);
  v1.use('/billing', billingRoutes);
  v1.use('/customers', customerRoutes);
  v1.use('/finance', financeRoutes);
  v1.use('/analytics', analyticsRoutes);
  v1.use('/reports', reportsRoutes);
  v1.use('/subscriptions', subscriptionRoutes);
  v1.use('/referrals', referralRoutes);
  v1.use('/audit', auditRoutes);
  v1.use('/notifications', notificationRoutes);
  v1.use('/hr', hrRoutes);
  v1.use('/expenses', expensesRoutes);
  v1.use('/admin', adminRoutes);
  app.use('/api/v1', v1);

  // 404 for unknown API routes
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));

  // Global error handler — always { error: { code, message } }
  app.use(errorHandler);

  return app;
}
