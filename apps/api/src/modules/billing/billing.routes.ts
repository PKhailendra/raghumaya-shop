import { Router } from 'express';
import { z } from 'zod';
import * as c from './billing.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { idempotency } from '../../lib/idempotency';
import {
  invoiceCreateSchema,
  invoiceUpdateSchema,
  invoiceQuerySchema,
  paymentCreateSchema,
  paymentQuerySchema,
  shareInvoiceSchema,
  smsLinkSchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

/* Public share-link resolution (token is the capability) */
r.get('/shared/:token', c.getSharedInvoice);

r.use(authenticate, requireShopContext);

const invView = requirePermission('INVOICE_VIEW');
const invCreate = requirePermission('INVOICE_CREATE');
const invUpdate = requirePermission('INVOICE_UPDATE');
const payView = requirePermission('PAYMENT_VIEW');
const payCreate = requirePermission('PAYMENT_CREATE');

r.post('/invoices', invCreate, idempotency(), validateRequest({ body: invoiceCreateSchema }), c.createInvoice);
r.get('/invoices', invView, validateRequest({ query: invoiceQuerySchema }), c.listInvoices);
r.get('/invoices/:id', invView, validateRequest({ params: uuidParam }), c.getInvoice);
r.patch('/invoices/:id', invUpdate, validateRequest({ params: uuidParam, body: invoiceUpdateSchema }), c.updateInvoice);
r.post('/invoices/:id/pdf', invView, validateRequest({ params: uuidParam }), c.generatePdf);
r.get('/invoices/:id/download', invView, validateRequest({ params: uuidParam }), c.downloadPdf);
r.post('/invoices/:id/share', invView, validateRequest({ params: uuidParam, body: shareInvoiceSchema }), c.shareInvoice);
r.post('/invoices/:id/sms-link', invView, validateRequest({ params: uuidParam, body: smsLinkSchema }), c.smsInvoiceLink);
r.post('/invoices/:id/whatsapp-link', invView, validateRequest({ params: uuidParam, body: smsLinkSchema }), c.whatsappInvoiceLink);

r.post('/payments', payCreate, idempotency(), validateRequest({ body: paymentCreateSchema }), c.createPayment);
r.get('/payments', payView, validateRequest({ query: paymentQuerySchema }), c.listPayments);

export default r;
