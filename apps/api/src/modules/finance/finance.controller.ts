import type { Request, Response } from 'express';
import * as service from './finance.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

type QL = { page: number; limit: number; fromDate?: string; toDate?: string; categoryId?: string; search?: string };
const q = (req: Request) => req.query as unknown as QL;

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCategory(ctxFromReq(req), req.body));
});
export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listCategories(ctxFromReq(req), req.query as unknown as { page: number; limit: number; type?: 'INCOME' | 'EXPENSE' }));
});

function crudController(model: { create(c: unknown, b: unknown): Promise<unknown>; list(c: unknown, q: unknown): Promise<unknown>; update(c: unknown, id: string, b: unknown): Promise<unknown>; remove(c: unknown, id: string): Promise<unknown> }) {
  return {
    create: asyncHandler(async (req: Request, res: Response) => {
      res.status(201).json(await model.create(ctxFromReq(req), req.body));
    }),
    list: asyncHandler(async (req: Request, res: Response) => {
      res.json(await model.list(ctxFromReq(req), q(req)));
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      res.json(await model.update(ctxFromReq(req), req.params.id, req.body));
    }),
    remove: asyncHandler(async (req: Request, res: Response) => {
      res.json(await model.remove(ctxFromReq(req), req.params.id));
    }),
  };
}

export const revenueCtrl = crudController(service.revenues);
export const expenseCtrl = crudController(service.expenses);
export const assetCtrl = crudController(service.assets);
export const liabilityCtrl = crudController(service.liabilities);

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.dashboard(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const cashFlow = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.cashFlow(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const profitLoss = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.profitLoss(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const revenueAnalysis = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.revenueAnalysis(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const monthlyReport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.monthlyReport(ctxFromReq(req), Number(req.query.year), Number(req.query.month)));
});
export const yearlyReport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.yearlyReport(ctxFromReq(req), Number(req.query.year)));
});
export const taxReport = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.taxReport(ctxFromReq(req), req.query as unknown as { fromDate?: string; toDate?: string }));
});
