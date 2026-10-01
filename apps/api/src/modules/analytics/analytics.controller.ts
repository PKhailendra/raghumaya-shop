import type { Request, Response } from 'express';
import * as service from './analytics.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

type Range = { fromDate?: string; toDate?: string };
const q = (req: Request) => req.query as unknown as Range;

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.dashboard(ctxFromReq(req), q(req)));
});
export const salesSummary = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.salesSummary(ctxFromReq(req), q(req)));
});
export const salesChart = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.salesChart(ctxFromReq(req), req.query as unknown as Range & { groupBy?: 'day' | 'week' | 'month' }));
});
export const topProducts = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.topProductsFn(ctxFromReq(req), req.query as unknown as Range & { limit?: number }));
});
export const topCategories = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.topCategoriesFn(ctxFromReq(req), req.query as unknown as Range & { limit?: number }));
});
export const customerInsights = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.customerInsightsFn(ctxFromReq(req), q(req)));
});
export const paymentAnalysis = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.paymentAnalysisFn(ctxFromReq(req), q(req)));
});
export const inventoryInsights = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.inventoryInsights(ctxFromReq(req)));
});
export const profitAnalysis = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.profitAnalysis(ctxFromReq(req), q(req)));
});
export const revenueByPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.revenueByPaymentMethod(ctxFromReq(req), q(req)));
});
export const customerGrowth = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.customerGrowth(ctxFromReq(req), q(req)));
});
export const productPerformance = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.productPerformance(ctxFromReq(req), req.query as unknown as Range & { limit?: number; sortBy?: 'revenue' | 'quantity' | 'margin' }));
});
export const staffPerformance = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.staffPerformance(ctxFromReq(req), q(req)));
});
