import { Router } from 'express';
import * as c from './audit.controller';
import { authenticate, requireShopContextOrAdmin, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { auditQuerySchema, dateRangeSchema } from '@raghumaya/shared';

const r = Router();

r.use(authenticate, requireShopContextOrAdmin);

const view = requirePermission('AUDIT_VIEW');

r.get('/', view, validateRequest({ query: auditQuerySchema }), c.listAuditLogs);
r.get('/dashboard', view, validateRequest({ query: dateRangeSchema }), c.auditDashboard);

export default r;
