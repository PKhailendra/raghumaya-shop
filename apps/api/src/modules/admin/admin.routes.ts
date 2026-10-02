import { Router } from 'express';
import { z } from 'zod';
import * as c from './admin.controller';
import { authenticate, requireAdmin, requireSuperAdmin } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  paginationSchema,
  ticketCreateSchema,
  ticketUpdateSchema,
  ticketReplySchema,
  planCreateSchema,
  planUpdateSchema,
} from '@raghumaya/shared';
import { registerShopOwnerSchema, SHOP_TYPES } from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });
const shopListQ = paginationSchema.extend({ search: z.string().optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() });
const userListQ = paginationSchema.extend({ search: z.string().optional(), status: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED']).optional() });
const ticketListQ = paginationSchema.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  search: z.string().optional(),
});
const subListQ = paginationSchema.extend({ status: z.enum(['ACTIVE', 'TRIAL', 'EXPIRED', 'CANCELLED']).optional() });
const approvalListQ = paginationSchema.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
const loginHistoryQ = paginationSchema.extend({ accountId: z.string().uuid().optional(), fromDate: z.string().optional(), toDate: z.string().optional() });

r.use(authenticate);

/* tickets can be opened by shop users too */
const tickets = Router();
tickets.post('/', validateRequest({ body: ticketCreateSchema }), c.createTicket);
tickets.get('/', requireAdmin, validateRequest({ query: ticketListQ }), c.listTickets);
tickets.get('/:id', validateRequest({ params: uuidParam }), c.getTicket);
tickets.patch('/:id', requireAdmin, validateRequest({ params: uuidParam, body: ticketUpdateSchema }), c.updateTicket);
tickets.post('/:id/replies', validateRequest({ params: uuidParam, body: ticketReplySchema }), c.replyTicket);
r.use('/tickets', tickets);

/* everything below requires platform admin */
r.use(requireAdmin);

r.get('/dashboard', c.platformDashboard);
r.get('/finance/summary', c.financeSummary);
r.get('/audit-logs', c.platformAuditLogs);
r.get('/referrals/stats', c.referralStats);
r.get('/referrals/dashboard', c.referralStats);
r.get('/referrals/codes', c.listReferralCodes);
r.get('/referrals', c.listReferralsAdmin);

r.get('/shops', validateRequest({ query: shopListQ }), c.listShops);
r.post('/shop-owners', requireSuperAdmin, validateRequest({ body: registerShopOwnerSchema }), c.createShopOwner);
r.get('/shops/:id', validateRequest({ params: uuidParam }), c.getShop);
r.patch('/shops/:id', validateRequest({ params: uuidParam, body: z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), phone: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), pincode: z.string().optional(), gstNumber: z.string().optional(), shopType: z.enum(SHOP_TYPES).optional() }).strict() }), c.updateShop);
r.post('/shops/:id/suspend', requireSuperAdmin, validateRequest({ params: uuidParam, body: z.object({ reason: z.string().optional() }) }), c.suspendShop);
r.post('/shops/:id/reactivate', requireSuperAdmin, validateRequest({ params: uuidParam }), c.reactivateShop);
r.delete('/shops/:id', requireSuperAdmin, validateRequest({ params: uuidParam }), c.deleteShop);

r.get('/users', validateRequest({ query: userListQ }), c.listUsers);
r.get('/users/:id', validateRequest({ params: uuidParam }), c.getUser);
r.patch('/users/:id', validateRequest({ params: uuidParam, body: z.object({ fullName: z.string().min(1).optional(), phone: z.string().nullable().optional(), email: z.string().email().optional() }).strict() }), c.updateUser);
r.post('/users/:id/suspend', requireSuperAdmin, validateRequest({ params: uuidParam, body: z.object({ reason: z.string().optional() }) }), c.suspendUser);
r.post('/users/:id/reactivate', requireSuperAdmin, validateRequest({ params: uuidParam }), c.reactivateUser);
r.post('/users/:id/reset-password', requireSuperAdmin, validateRequest({ params: uuidParam, body: z.object({ password: z.string().min(8).max(72) }) }), c.resetUserPassword);

r.post('/plans', requireSuperAdmin, validateRequest({ body: planCreateSchema }), c.createPlan);
r.patch('/plans/:id', requireSuperAdmin, validateRequest({ params: uuidParam, body: planUpdateSchema }), c.updatePlan);
r.get('/subscriptions', validateRequest({ query: subListQ }), c.listSubscriptions);

r.get('/approvals', validateRequest({ query: approvalListQ }), c.listApprovals);
r.post('/approvals/:id/approve', requireSuperAdmin, validateRequest({ params: uuidParam }), c.approveChange);
r.post('/approvals/:id/reject', requireSuperAdmin, validateRequest({ params: uuidParam, body: z.object({ reason: z.string().optional() }) }), c.rejectChange);
r.post('/approvals/:id/request-modification', requireSuperAdmin, validateRequest({ params: uuidParam, body: z.object({ comment: z.string().optional() }) }), c.requestModification);

r.get('/reports/revenue', validateRequest({ query: z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }) }), c.revenueReport);
r.get('/settings', c.getSettings);
r.put('/settings', requireSuperAdmin, validateRequest({ body: z.record(z.unknown()) }), c.updateSettings);
r.get('/login-history', validateRequest({ query: loginHistoryQ }), c.loginHistory);
r.get('/devices', validateRequest({ query: paginationSchema.extend({ search: z.string().optional() }) }), c.listDevices);
r.post('/devices/:id/revoke', requireSuperAdmin, validateRequest({ params: uuidParam }), c.revokeDevice);

export default r;
