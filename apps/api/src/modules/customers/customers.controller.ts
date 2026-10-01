import type { Request, Response } from 'express';
import * as service from './customers.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCustomer(ctxFromReq(req), req.body));
});
export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listCustomers(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listCustomers>[1]));
});
export const duePayments = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.duePayments(ctxFromReq(req), req.query as unknown as { page: number; limit: number }));
});
export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getCustomer(ctxFromReq(req), req.params.id));
});
export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateCustomer(ctxFromReq(req), req.params.id, req.body));
});
export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteCustomer(ctxFromReq(req), req.params.id));
});
export const customerHistory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.customerHistory(ctxFromReq(req), req.params.id, req.query as unknown as { page: number; limit: number }));
});
export const customerPurchases = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.customerPurchases(ctxFromReq(req), req.params.id, req.query as unknown as { page: number; limit: number }));
});
export const customerLedger = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.customerLedger(ctxFromReq(req), req.params.id, req.query as unknown as { fromDate?: string; toDate?: string }));
});
export const sendSmsReminder = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.sendSmsReminder(ctxFromReq(req), req, req.params.id, req.body));
});
export const sendWhatsappReminder = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.sendWhatsappReminder(ctxFromReq(req), req, req.params.id, req.body));
});
export const listReminders = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listReminders(ctxFromReq(req), req.params.id, req.query as unknown as { page: number; limit: number }));
});
