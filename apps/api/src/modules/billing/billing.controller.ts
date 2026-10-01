import type { Request, Response } from 'express';
import * as service from './billing.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createInvoice(ctxFromReq(req), req.body));
});
export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listInvoices(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listInvoices>[1]));
});
export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getInvoice(ctxFromReq(req), req.params.id));
});
export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateInvoice(ctxFromReq(req), req.params.id, req.body));
});
export const generatePdf = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.generatePdf(ctxFromReq(req), req.params.id));
});
export const downloadPdf = asyncHandler(async (req: Request, res: Response) => {
  const { pdfPath, invoiceNumber } = await service.downloadPdf(ctxFromReq(req), req.params.id);
  res.download(pdfPath, `${invoiceNumber}.pdf`);
});
export const shareInvoice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.shareInvoice(ctxFromReq(req), req, req.params.id, req.body));
});
export const getSharedInvoice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getSharedInvoice(req.params.token));
});
export const smsInvoiceLink = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.smsInvoiceLink(ctxFromReq(req), req, req.params.id, req.body));
});
export const whatsappInvoiceLink = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.whatsappInvoiceLink(ctxFromReq(req), req, req.params.id, req.body));
});
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createPayment(ctxFromReq(req), req.body));
});
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listPayments(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listPayments>[1]));
});
