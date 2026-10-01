import type { Request, Response } from 'express';
import * as service from './purchases.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createPurchase(ctxFromReq(req), req.body));
});
export const listPurchases = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listPurchases(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listPurchases>[1]));
});
export const getPurchase = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getPurchase(ctxFromReq(req), req.params.id));
});
export const updatePurchase = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updatePurchase(ctxFromReq(req), req.params.id, req.body));
});
