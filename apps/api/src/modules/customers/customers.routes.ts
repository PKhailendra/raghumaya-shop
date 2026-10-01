import { Router } from 'express';
import { z } from 'zod';
import * as c from './customers.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerQuerySchema,
  reminderSchema,
  paginationSchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContext);

const view = requirePermission('CUSTOMER_VIEW');
const create = requirePermission('CUSTOMER_CREATE');
const update = requirePermission('CUSTOMER_UPDATE');
const remove = requirePermission('CUSTOMER_DELETE');

r.post('/', create, validateRequest({ body: customerCreateSchema }), c.createCustomer);
r.get('/', view, validateRequest({ query: customerQuerySchema }), c.listCustomers);
r.get('/due-payments', view, validateRequest({ query: paginationSchema }), c.duePayments);
r.get('/:id', view, validateRequest({ params: uuidParam }), c.getCustomer);
r.patch('/:id', update, validateRequest({ params: uuidParam, body: customerUpdateSchema }), c.updateCustomer);
r.delete('/:id', remove, validateRequest({ params: uuidParam }), c.deleteCustomer);
r.get('/:id/history', view, validateRequest({ params: uuidParam, query: paginationSchema }), c.customerHistory);
r.get('/:id/purchases', view, validateRequest({ params: uuidParam, query: paginationSchema }), c.customerPurchases);
r.get('/:id/ledger', view, validateRequest({ params: uuidParam, query: z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }) }), c.customerLedger);
r.post('/:id/reminders/sms', update, validateRequest({ params: uuidParam, body: reminderSchema }), c.sendSmsReminder);
r.post('/:id/reminders/whatsapp', update, validateRequest({ params: uuidParam, body: reminderSchema }), c.sendWhatsappReminder);
r.get('/:id/reminders', view, validateRequest({ params: uuidParam, query: paginationSchema }), c.listReminders);

export default r;
