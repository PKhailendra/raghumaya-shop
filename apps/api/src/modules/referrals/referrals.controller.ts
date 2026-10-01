import type { Request, Response } from 'express';
import * as service from './referrals.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const getMyCode = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getMyCode(ctxFromReq(req)));
});
export const regenerateCode = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.regenerateCode(ctxFromReq(req)));
});
export const validateCode = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.validateCode(req.params.code));
});
export const trackReferral = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.trackReferral(ctxFromReq(req), req.query as unknown as { page: number; limit: number }));
});
export const referralDashboard = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.referralDashboard(ctxFromReq(req)));
});
export const listReferrals = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listReferrals(ctxFromReq(req), req.query as unknown as { page: number; limit: number; status?: 'PENDING' | 'CONVERTED' | 'REWARDED' }));
});
export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCoupon(ctxFromReq(req), req.body));
});
export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listCoupons(ctxFromReq(req), req.query as unknown as { page: number; limit: number }));
});
export const validateCoupon = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.validateCoupon(ctxFromReq(req), req.params.code));
});
