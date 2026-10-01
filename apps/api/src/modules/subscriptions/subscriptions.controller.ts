import type { Request, Response } from 'express';
import * as service from './subscriptions.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const getPlans = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getPlans(req.query as unknown as { activeOnly: boolean }));
});
export const getCurrent = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getCurrent(ctxFromReq(req)));
});
export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getHistory(ctxFromReq(req), req.query as unknown as { page: number; limit: number }));
});
export const getLimits = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getLimits(ctxFromReq(req)));
});
export const getFeatures = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getFeatures(ctxFromReq(req)));
});
export const changePlan = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.changePlan(ctxFromReq(req), req.body));
});
export const cancelSubscription = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.cancelSubscription(ctxFromReq(req), req.body));
});
export const adminAssign = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminAssign(ctxFromReq(req), req.body));
});
