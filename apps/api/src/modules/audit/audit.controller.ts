import type { Request, Response } from 'express';
import * as service from './audit.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listAuditLogs(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listAuditLogs>[1]));
});
export const auditDashboard = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.auditDashboard(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
