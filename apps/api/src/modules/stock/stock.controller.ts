import type { Request, Response } from 'express';
import * as service from './stock.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createWarehouse(ctxFromReq(req), req.body));
});
export const listWarehouses = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.listWarehouses(ctxFromReq(req)) });
});
export const updateWarehouse = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateWarehouse(ctxFromReq(req), req.params.id, req.body));
});
export const deleteWarehouse = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteWarehouse(ctxFromReq(req), req.params.id));
});

export const stockIn = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.stockIn(ctxFromReq(req), req.body));
});
export const stockOut = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.stockOut(ctxFromReq(req), req.body));
});
export const stockTransfer = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.stockTransfer(ctxFromReq(req), req.body));
});
export const purchaseUpdate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.purchaseUpdate(ctxFromReq(req), req.body));
});
export const salesDeduction = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.salesDeduction(ctxFromReq(req), req.body));
});

export const listLevels = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listLevels(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listLevels>[1]));
});
export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listMovements(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listMovements>[1]));
});
export const lowStockAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  res.json(await service.lowStockAlerts(ctxFromReq(req), page, limit));
});
export const outOfStockAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  res.json(await service.outOfStockAlerts(ctxFromReq(req), page, limit));
});
export const expiryAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { days, page, limit } = req.query as unknown as { days: number; page: number; limit: number };
  res.json(await service.expiryAlerts(ctxFromReq(req), days ?? 30, page, limit));
});
export const recalculate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.recalculate(ctxFromReq(req), (req.query as { productId?: string }).productId));
});
