import type { Request, Response } from 'express';
import * as service from './admin.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

type PL = { page: number; limit: number };

export const platformDashboard = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.platformDashboard());
});
export const listShops = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listShops(ctxFromReq(req), req.query as unknown as PL & { search?: string; status?: 'ACTIVE' | 'SUSPENDED' }));
});
export const getShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getShop(req.params.id));
});
export const updateShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateShop(ctxFromReq(req), req.params.id, req.body));
});
export const suspendShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.suspendShop(ctxFromReq(req), req.params.id, req.body));
});
export const reactivateShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.reactivateShop(ctxFromReq(req), req.params.id));
});
export const createShopOwner = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createShopOwner(ctxFromReq(req), req.body));
});
export const createShopForOwner = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createShopForOwner(ctxFromReq(req), req.body));
});
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listUsers(ctxFromReq(req), req.query as unknown as PL & { search?: string; status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'BLOCKED' }));
});
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getUser(req.params.id));
});
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateUser(ctxFromReq(req), req.params.id, req.body));
});
export const suspendUser = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.suspendUser(ctxFromReq(req), req.params.id, req.body));
});
export const reactivateUser = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.reactivateUser(ctxFromReq(req), req.params.id));
});
export const listApprovals = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listApprovals(ctxFromReq(req), req.query as unknown as PL & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' }));
});
export const approveChange = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.approveChange(ctxFromReq(req), req.params.id));
});
export const rejectChange = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.rejectChange(ctxFromReq(req), req.params.id, req.body));
});

export const requestModification = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.requestModification(ctxFromReq(req), req.params.id, req.body));
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.resetUserPassword(ctxFromReq(req), req.params.id, req.body));
});

export const deleteShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteShop(ctxFromReq(req), req.params.id));
});

export const financeSummary = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.financeSummary());
});

export const platformAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.platformAuditLogs(ctxFromReq(req), req.query as never));
});

export const referralStats = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.referralStats());
});

export const listReferralCodes = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listReferralCodes(ctxFromReq(req), req.query as never));
});

export const listReferralsAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listReferralsAdmin(ctxFromReq(req), req.query as never));
});
export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createTicket(ctxFromReq(req), req.body));
});
export const listTickets = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listTickets(req.query as unknown as PL & { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; search?: string }));
});
export const getTicket = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getTicket(ctxFromReq(req), req.params.id));
});
export const updateTicket = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateTicket(ctxFromReq(req), req.params.id, req.body));
});
export const replyTicket = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.replyTicket(ctxFromReq(req), req.params.id, req.body));
});
export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createPlan(ctxFromReq(req), req.body));
});
export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updatePlan(ctxFromReq(req), req.params.id, req.body));
});
export const listSubscriptions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listSubscriptionsAdmin(req.query as unknown as PL & { status?: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED' }));
});
export const revenueReport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.revenueReport(req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.getSettings());
});
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateSettings(ctxFromReq(req), req.body));
});
export const loginHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.loginHistory(req.query as unknown as PL & { accountId?: string; fromDate?: string; toDate?: string }));
});
export const listDevices = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listAllDevices(req.query as unknown as PL & { search?: string }));
});
export const revokeDevice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.revokeDevice(ctxFromReq(req), req.params.id));
});
