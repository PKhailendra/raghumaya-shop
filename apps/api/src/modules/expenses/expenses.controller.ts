import type { Request, Response } from 'express';
import * as service from './expenses.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.list(ctxFromReq(req), req.query as unknown as { page: number; limit: number; category?: string; search?: string; fromDate?: string; toDate?: string }));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.create(ctxFromReq(req), req.body));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.update(ctxFromReq(req), req.params.id, req.body));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.remove(ctxFromReq(req), req.params.id));
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.summary(ctxFromReq(req), Number(req.query.year), Number(req.query.month)));
});

export const categories = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: service.TRACKER_CATEGORY_LIST });
});
