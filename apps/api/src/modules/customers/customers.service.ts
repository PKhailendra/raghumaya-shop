import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, getPagination, pageMeta, parseDate } from '../../lib/utils';
import { sendSms, whatsappLink } from '../../lib/helpers';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import { shareInvoice } from '../billing/billing.service';
import type { Request } from 'express';
import type { LedgerRow } from '@raghumaya/shared';

export async function createCustomer(ctx: ReqCtx, input: Record<string, unknown>) {
  const shopId = requireShopId(ctx);
  const customer = await prisma.customer.create({
    data: {
      shopId,
      name: input.name as string,
      phone: (input.phone as string) || null,
      email: (input.email as string) || null,
      address: (input.address as string) || null,
      city: (input.city as string) || null,
      state: (input.state as string) || null,
      pincode: (input.pincode as string) || null,
      gstNumber: (input.gstNumber as string) || null,
      creditLimit: D(input.creditLimit as string | undefined),
      notes: (input.notes as string) || null,
    },
  });
  await writeAudit({ ...ctx, action: 'CUSTOMER_CREATED', entityType: 'customer', entityId: customer.id, shopId, newValue: customer });
  return customer;
}

export async function listCustomers(ctx: ReqCtx, query: { page: number; limit: number; search?: string; hasDue?: boolean }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.CustomerWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }, { email: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
    ...(query.hasDue ? { outstandingBalance: { gt: 0 } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
    prisma.customer.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function getCustomer(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const customer = await prisma.customer.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  return customer;
}

export async function updateCustomer(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
  const shopId = requireShopId(ctx);
  const before = await getCustomer(ctx, id);
  const data: Prisma.CustomerUpdateInput = {};
  for (const k of ['phone', 'email', 'address', 'city', 'state', 'pincode', 'gstNumber', 'notes'] as const) {
    if (input[k] !== undefined) data[k] = (input[k] as string) || null;
  }
  if (input.name !== undefined) data.name = input.name as string;
  if (input.creditLimit !== undefined) data.creditLimit = D(input.creditLimit as string);
  const after = await prisma.customer.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: 'CUSTOMER_UPDATED', entityType: 'customer', entityId: id, shopId, oldValue: before, newValue: after });
  return after;
}

export async function deleteCustomer(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const customer = await getCustomer(ctx, id);
  const invoiceCount = await prisma.invoice.count({ where: { customerId: id, deletedAt: null } });
  if (invoiceCount > 0) throw new HttpError(409, 'CUSTOMER_IN_USE', 'Customer has invoices and cannot be deleted');
  await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'CUSTOMER_DELETED', entityType: 'customer', entityId: id, shopId, severity: 'HIGH' });
  return { deleted: true };
}

export async function duePayments(ctx: ReqCtx, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.InvoiceWhereInput = {
    shopId,
    deletedAt: null,
    status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    customerId: { not: null },
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip, take, orderBy: { dueDate: 'asc' }, include: { customer: { select: { id: true, name: true, phone: true } } } }),
    prisma.invoice.count({ where }),
  ]);
  const data = rows.map((inv) => ({
    ...inv,
    dueAmount: inv.totalAmount.sub(inv.paidAmount).toString(),
    daysOverdue: inv.dueDate ? Math.max(0, Math.floor((Date.now() - inv.dueDate.getTime()) / 86400000)) : 0,
  }));
  return { data, meta: pageMeta(total, query.page, query.limit) };
}

export async function customerHistory(ctx: ReqCtx, id: string, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  await getCustomer(ctx, id);
  const { skip, take } = getPagination(query.page, query.limit);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { customerId: id, shopId, deletedAt: null }, orderBy: { issueDate: 'desc' }, take: 100 }),
    prisma.payment.findMany({ where: { customerId: id, shopId, deletedAt: null }, orderBy: { paymentDate: 'desc' }, take: 100 }),
  ]);
  const events = [
    ...invoices.map((i) => ({ kind: 'INVOICE' as const, date: i.issueDate, id: i.id, reference: i.invoiceNumber, amount: i.totalAmount.toString(), status: i.status })),
    ...payments.map((p) => ({ kind: 'PAYMENT' as const, date: p.paymentDate, id: p.id, reference: p.referenceNumber ?? p.id.slice(0, 8), amount: p.amount.toString(), mode: p.mode })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  return { data: events.slice(skip, skip + take), meta: pageMeta(events.length, query.page, query.limit) };
}

export async function customerPurchases(ctx: ReqCtx, id: string, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  await getCustomer(ctx, id);
  const { skip, take } = getPagination(query.page, query.limit);
  const where = { customerId: id, shopId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip, take, orderBy: { issueDate: 'desc' }, include: { items: { where: { deletedAt: null } } } }),
    prisma.invoice.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function customerLedger(
  ctx: ReqCtx,
  id: string,
  query: { fromDate?: string; toDate?: string },
): Promise<{ customer: unknown; ledger: LedgerRow[]; closingBalance: string }> {
  const shopId = requireShopId(ctx);
  const customer = await getCustomer(ctx, id);
  const from = query.fromDate ? parseDate(query.fromDate)! : new Date(0);
  const to = query.toDate ? parseDate(query.toDate)! : new Date();
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { customerId: id, shopId, deletedAt: null, issueDate: { gte: from, lte: to } }, orderBy: { issueDate: 'asc' } }),
    prisma.payment.findMany({ where: { customerId: id, shopId, direction: 'IN', deletedAt: null, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: 'asc' } }),
  ]);
  const entries = [
    ...invoices.map((i) => ({ date: i.issueDate, type: 'INVOICE' as const, reference: i.invoiceNumber, referenceId: i.id, debit: i.totalAmount, credit: new Prisma.Decimal(0) })),
    ...payments.map((p) => ({ date: p.paymentDate, type: 'PAYMENT' as const, reference: p.referenceNumber ?? `PAY-${p.id.slice(0, 8)}`, referenceId: p.id, debit: new Prisma.Decimal(0), credit: p.amount })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = new Prisma.Decimal(0);
  const ledger: LedgerRow[] = entries.map((e) => {
    balance = balance.add(e.debit).sub(e.credit);
    return {
      date: e.date.toISOString(),
      type: e.type,
      reference: e.reference,
      referenceId: e.referenceId,
      debit: e.debit.toString(),
      credit: e.credit.toString(),
      balance: balance.toString(),
    };
  });
  return { customer, ledger, closingBalance: balance.toString() };
}

async function recordReminder(
  ctx: ReqCtx,
  shopId: string,
  customerId: string,
  channel: 'SMS' | 'WHATSAPP',
  recipient: string,
  message: string,
  invoiceId?: string,
  invoiceUrl?: string,
) {
  const reminder = await prisma.customerReminder.create({
    data: { shopId, customerId, invoiceId, channel, recipient, message, invoiceUrl, status: 'SENT', sentAt: new Date() },
  });
  await writeAudit({ ...ctx, action: 'CUSTOMER_REMINDER_SENT', entityType: 'customer_reminder', entityId: reminder.id, shopId, metadata: { channel, recipient } });
  return reminder;
}

export async function sendSmsReminder(ctx: ReqCtx, req: Request, id: string, input: { invoiceId?: string; phone?: string; message?: string }) {
  const shopId = requireShopId(ctx);
  const customer = await getCustomer(ctx, id);
  const phone = input.phone ?? customer.phone;
  if (!phone) throw new HttpError(400, 'NO_PHONE', 'Customer has no phone number');

  let invoiceUrl: string | undefined;
  let invoice: { invoiceNumber: string; totalAmount: Prisma.Decimal } | null = null;
  if (input.invoiceId) {
    invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, shopId, deletedAt: null } });
    if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
    const shared = await shareInvoice(ctx, req, input.invoiceId, { channel: 'SMS', expiresInHours: 72 });
    invoiceUrl = shared.url;
  }
  const message = input.message ?? (invoice
    ? `Reminder: invoice ${invoice.invoiceNumber} for Rs.${invoice.totalAmount.toString()} is due. Pay here: ${invoiceUrl}`
    : `Reminder from your shop: you have an outstanding balance of Rs.${customer.outstandingBalance.toString()}.`);

  const smsLog = await prisma.smsLog.create({ data: { shopId, invoiceId: input.invoiceId, customerId: id, to: phone, message, provider: 'console', status: 'QUEUED' } });
  await sendSms({ to: phone, message, shopId, customerId: id, invoiceId: input.invoiceId });
  await prisma.smsLog.update({ where: { id: smsLog.id }, data: { status: 'SENT', sentAt: new Date() } });
  const reminder = await recordReminder(ctx, shopId, id, 'SMS', phone, message, input.invoiceId, invoiceUrl);
  return { sent: true, reminderId: reminder.id };
}

export async function sendWhatsappReminder(ctx: ReqCtx, req: Request, id: string, input: { invoiceId?: string; phone?: string; message?: string }) {
  const shopId = requireShopId(ctx);
  const customer = await getCustomer(ctx, id);
  const phone = input.phone ?? customer.phone;
  if (!phone) throw new HttpError(400, 'NO_PHONE', 'Customer has no phone number');

  let invoiceUrl: string | undefined;
  if (input.invoiceId) {
    const shared = await shareInvoice(ctx, req, input.invoiceId, { channel: 'WHATSAPP', expiresInHours: 72 });
    invoiceUrl = shared.url;
  }
  const text = input.message ?? `Payment reminder: you have an outstanding balance of Rs.${customer.outstandingBalance.toString()}.${invoiceUrl ? ` View invoice: ${invoiceUrl}` : ''}`;
  const url = whatsappLink(phone, text);
  const reminder = await recordReminder(ctx, shopId, id, 'WHATSAPP', phone, text, input.invoiceId, invoiceUrl);
  return { url, reminderId: reminder.id };
}

export async function listReminders(ctx: ReqCtx, id: string, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  await getCustomer(ctx, id);
  const { skip, take } = getPagination(query.page, query.limit);
  const where = { customerId: id, shopId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.customerReminder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.customerReminder.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}
