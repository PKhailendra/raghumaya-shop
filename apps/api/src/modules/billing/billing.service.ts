import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, ZERO, getPagination, pageMeta, parseDate, round2 } from '../../lib/utils';
import { generateInvoicePdf } from '../../lib/pdf';
import { sendSms, whatsappLink, absoluteUrl } from '../../lib/helpers';
import { randomToken, sha256 } from '../../lib/crypto';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import type { InvoiceCreateInput } from '@raghumaya/shared';
import type { Request } from 'express';
import { applyStockMovements, type MovementInput } from '../stock/stock.service';

export interface GstLineInput {
  quantity: string;
  unitPrice: string;
  discountRate: string;
  gstRate: string;
}

/** GST math per design doc: gross -> discount -> taxable -> gst (CGST/SGST or IGST). */
export function calcLine(input: GstLineInput, isInterState: boolean) {
  const qty = D(input.quantity);
  const price = D(input.unitPrice);
  const lineGross = round2(qty.mul(price));
  const discountAmount = round2(lineGross.mul(D(input.discountRate)).div(100));
  const taxableAmount = round2(lineGross.sub(discountAmount));
  const gstAmount = round2(taxableAmount.mul(D(input.gstRate)).div(100));
  const half = round2(gstAmount.div(2));
  const cgstAmount = isInterState ? ZERO : half;
  const sgstAmount = isInterState ? ZERO : gstAmount.sub(half);
  const igstAmount = isInterState ? gstAmount : ZERO;
  const lineTotal = round2(taxableAmount.add(gstAmount));
  return { lineGross, discountAmount, taxableAmount, gstAmount, cgstAmount, sgstAmount, igstAmount, lineTotal };
}

async function nextInvoiceNumber(shopId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await prisma.invoice.findFirst({
    where: { shopId, invoiceNumber: { startsWith: prefix }, deletedAt: null },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  let seq = 0;
  if (latest) {
    const m = latest.invoiceNumber.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10);
  }
  return `${prefix}${String(seq + 1).padStart(4, '0')}`;
}

const invoiceInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true, gstNumber: true } },
  items: { where: { deletedAt: null } },
};

function invoiceStatusFor(paid: Prisma.Decimal, total: Prisma.Decimal, current: string): 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' {
  if (current === 'CANCELLED' || current === 'DRAFT') return current as never;
  if (paid.gte(total) && total.gt(0)) return 'PAID';
  if (paid.gt(0)) return 'PARTIALLY_PAID';
  return current === 'OVERDUE' ? 'OVERDUE' : 'ISSUED';
}

/* ------------------------------- invoices ------------------------------- */

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Auto stock deduction for an invoice (ledger-first). Idempotent: skips if a SALE movement already exists for the invoice. */
async function deductInvoiceStock(
  tx: TxClient,
  shopId: string,
  actorId: string | undefined,
  invoice: { id: string; items: Array<{ productId: string | null; variantId: string | null; quantity: unknown }> },
): Promise<void> {
  const existing = await tx.stockMovement.findFirst({ where: { shopId, referenceType: 'INVOICE', referenceId: invoice.id, type: 'SALE', deletedAt: null } });
  if (existing) return;
  const warehouse = await tx.warehouse.findFirst({ where: { shopId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  if (!warehouse) throw new HttpError(400, 'NO_WAREHOUSE', 'No warehouse available for stock deduction');
  const lines: MovementInput[] = invoice.items
    .filter((l) => l.productId)
    .map((l) => ({
      productId: l.productId!,
      variantId: l.variantId ?? undefined,
      quantity: new Prisma.Decimal(l.quantity as number | string).toString(),
      warehouseId: warehouse.id,
      type: 'SALE' as const,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
    }));
  if (lines.length > 0) await applyStockMovements(tx, shopId, actorId, lines);
}

/** Restore stock when an invoice is cancelled (reversal of the SALE deduction). Idempotent. */
async function restoreInvoiceStock(
  tx: TxClient,
  shopId: string,
  actorId: string | undefined,
  invoice: { id: string; items: Array<{ productId: string | null; variantId: string | null; quantity: unknown }> },
): Promise<void> {
  const deducted = await tx.stockMovement.findFirst({ where: { shopId, referenceType: 'INVOICE', referenceId: invoice.id, type: 'SALE', deletedAt: null } });
  if (!deducted) return;
  const reversed = await tx.stockMovement.findFirst({ where: { shopId, referenceType: 'INVOICE_REVERSAL', referenceId: invoice.id, deletedAt: null } });
  if (reversed) return;
  const warehouse = await tx.warehouse.findFirst({ where: { shopId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  if (!warehouse) throw new HttpError(400, 'NO_WAREHOUSE', 'No warehouse available for stock restoration');
  const lines: MovementInput[] = invoice.items
    .filter((l) => l.productId)
    .map((l) => ({
      productId: l.productId!,
      variantId: l.variantId ?? undefined,
      quantity: new Prisma.Decimal(l.quantity as number | string).toString(),
      warehouseId: warehouse.id,
      type: 'IN' as const,
      referenceType: 'INVOICE_REVERSAL',
      referenceId: invoice.id,
      notes: 'Invoice cancelled — stock restored',
    }));
  if (lines.length > 0) await applyStockMovements(tx, shopId, actorId, lines);
}

export async function createInvoice(ctx: ReqCtx, input: InvoiceCreateInput) {
  const shopId = requireShopId(ctx);
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, shopId, deletedAt: null } });
    if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  }
  const isInterState = input.isInterState ?? false;

  const invoice = await prisma.$transaction(async (tx) => {
    let invoiceNumber = input.invoiceNumber?.trim();
    if (invoiceNumber) {
      const dup = await tx.invoice.findFirst({ where: { shopId, invoiceNumber, deletedAt: null } });
      if (dup) throw new HttpError(409, 'INVOICE_NUMBER_EXISTS', 'Invoice number already exists');
    } else {
      invoiceNumber = await nextInvoiceNumber(shopId);
    }

    const lines = input.items.map((item) => {
      const t = calcLine({ quantity: item.quantity, unitPrice: item.unitPrice, discountRate: item.discountRate ?? '0', gstRate: item.gstRate ?? '0' }, isInterState);
      return { item, t };
    });
    type LineTotals = ReturnType<typeof calcLine>;
    const sumKey = (k: keyof LineTotals): Prisma.Decimal => lines.reduce((acc, l) => acc.add(l.t[k]), ZERO);

    const created = await tx.invoice.create({
      data: {
        shopId,
        customerId: input.customerId,
        invoiceNumber: invoiceNumber!,
        status: input.status ?? 'ISSUED',
        issueDate: parseDate(input.issueDate) ?? new Date(),
        dueDate: input.dueDate ? parseDate(input.dueDate)! : null,
        placeOfSupply: input.placeOfSupply,
        customerGstNumber: input.customerGstNumber,
        isInterState,
        subtotal: round2(sumKey('lineGross')),
        discountTotal: round2(sumKey('discountAmount')),
        taxableTotal: round2(sumKey('taxableAmount')),
        cgstTotal: round2(sumKey('cgstAmount')),
        sgstTotal: round2(sumKey('sgstAmount')),
        igstTotal: round2(sumKey('igstAmount')),
        taxTotal: round2(sumKey('gstAmount')),
        totalAmount: round2(sumKey('lineTotal')),
        paidAmount: ZERO,
        notes: input.notes,
        terms: input.terms,
        createdById: ctx.actor.accountId,
        items: {
          create: lines.map(({ item, t }) => ({
            productId: item.productId,
            variantId: item.variantId,
            description: item.description,
            hsnCode: item.hsnCode,
            quantity: D(item.quantity),
            unitPrice: D(item.unitPrice),
            discountRate: D(item.discountRate ?? 0),
            gstRate: D(item.gstRate ?? 0),
            lineGross: t.lineGross,
            discountAmount: t.discountAmount,
            taxableAmount: t.taxableAmount,
            gstAmount: t.gstAmount,
            cgstAmount: t.cgstAmount,
            sgstAmount: t.sgstAmount,
            igstAmount: t.igstAmount,
            lineTotal: t.lineTotal,
          })),
        },
      },
      include: invoiceInclude,
    });

    // keep customer outstanding balance in sync
    if (input.customerId) {
      await tx.customer.update({ where: { id: input.customerId }, data: { outstandingBalance: { increment: created.totalAmount } } });
    }

    // auto stock deduction for issued (non-draft) invoices
    if (created.status !== 'DRAFT') {
      await deductInvoiceStock(tx, shopId, ctx.actor.accountId, { id: created.id, items: created.items });
    }
    return created;
  });

  await writeAudit({ ...ctx, action: 'INVOICE_CREATED', entityType: 'invoice', entityId: invoice.id, shopId, newValue: { invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount.toString() } });
  return invoice;
}

export async function listInvoices(
  ctx: ReqCtx,
  query: { page: number; limit: number; search?: string; status?: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED'; customerId?: string; fromDate?: string; toDate?: string },
) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.InvoiceWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.search ? { OR: [{ invoiceNumber: { contains: query.search, mode: 'insensitive' } }, { customer: { name: { contains: query.search, mode: 'insensitive' } } }] } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.fromDate || query.toDate ? { issueDate: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip, take, orderBy: { issueDate: 'desc' }, include: { customer: { select: { id: true, name: true, phone: true } } } }),
    prisma.invoice.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function getInvoice(ctx: ReqCtx, id: string, shopIdOverride?: string) {
  const shopId = shopIdOverride ?? requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null }, include: { ...invoiceInclude, payments: { where: { deletedAt: null }, orderBy: { paymentDate: 'desc' } }, shareTokens: { where: { revokedAt: null, deletedAt: null } } } });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  return invoice;
}

export async function updateInvoice(
  ctx: ReqCtx,
  id: string,
  input: { customerId?: string | null; status?: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED'; dueDate?: string | null; placeOfSupply?: string | null; customerGstNumber?: string | null; isInterState?: boolean; notes?: string | null; terms?: string | null },
) {
  const shopId = requireShopId(ctx);
  const before = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  if (before.status === 'PAID' && input.status && input.status !== 'PAID') {
    throw new HttpError(409, 'INVOICE_LOCKED', 'Paid invoices cannot be moved back to unpaid states');
  }
  const after = await prisma.invoice.update({
    where: { id },
    data: {
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? parseDate(input.dueDate)! : null } : {}),
      ...(input.placeOfSupply !== undefined ? { placeOfSupply: input.placeOfSupply } : {}),
      ...(input.customerGstNumber !== undefined ? { customerGstNumber: input.customerGstNumber } : {}),
      ...(input.isInterState !== undefined ? { isInterState: input.isInterState } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.terms !== undefined ? { terms: input.terms } : {}),
    },
    include: invoiceInclude,
  });
  // stock sync on status transitions
  if (input.status && input.status !== before.status) {
    await prisma.$transaction(async (tx) => {
      const items = await tx.invoiceItem.findMany({ where: { invoiceId: id, deletedAt: null }, select: { productId: true, variantId: true, quantity: true } });
      const inv = { id, items };
      if (before.status === 'DRAFT' && input.status !== 'DRAFT' && input.status !== 'CANCELLED') {
        await deductInvoiceStock(tx, shopId, ctx.actor.accountId, inv);
      } else if (input.status === 'CANCELLED' && before.status !== 'DRAFT' && before.status !== 'CANCELLED') {
        await restoreInvoiceStock(tx, shopId, ctx.actor.accountId, inv);
      }
    });
  }
  await writeAudit({ ...ctx, action: 'INVOICE_UPDATED', entityType: 'invoice', entityId: id, shopId, oldValue: before, newValue: after });
  return after;
}

/* ------------------------------ PDF & share ------------------------------ */

export async function generatePdf(ctx: ReqCtx, id: string, shopIdOverride?: string) {
  const shopId = shopIdOverride ?? requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({
    where: { id, shopId, deletedAt: null },
    include: { items: { where: { deletedAt: null } }, customer: true, shop: true },
  });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');

  const filePath = await generateInvoicePdf(invoice.id, {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    shop: { name: invoice.shop.name, address: invoice.shop.address, phone: invoice.shop.phone, gstNumber: invoice.shop.gstNumber },
    customer: invoice.customer ? { name: invoice.customer.name, phone: invoice.customer.phone, address: invoice.customer.address, gstNumber: invoice.customer.gstNumber } : null,
    items: invoice.items.map((i) => ({
      description: i.description,
      hsnCode: i.hsnCode,
      quantity: i.quantity.toString(),
      unitPrice: i.unitPrice.toString(),
      discountAmount: i.discountAmount.toString(),
      taxableAmount: i.taxableAmount.toString(),
      gstAmount: i.gstAmount.toString(),
      lineTotal: i.lineTotal.toString(),
    })),
    totals: {
      subtotal: invoice.subtotal.toString(),
      discountTotal: invoice.discountTotal.toString(),
      taxableTotal: invoice.taxableTotal.toString(),
      cgstTotal: invoice.cgstTotal.toString(),
      sgstTotal: invoice.sgstTotal.toString(),
      igstTotal: invoice.igstTotal.toString(),
      taxTotal: invoice.taxTotal.toString(),
      totalAmount: invoice.totalAmount.toString(),
      paidAmount: invoice.paidAmount.toString(),
    },
    notes: invoice.notes,
    terms: invoice.terms,
  });

  const pdfUrl = `/api/v1/billing/invoices/${invoice.id}/download`;
  await prisma.invoice.update({ where: { id }, data: { pdfPath: filePath, pdfUrl } });
  await writeAudit({ ...ctx, action: 'INVOICE_PDF_GENERATED', entityType: 'invoice', entityId: id, shopId });
  return { pdfUrl, pdfPath: filePath };
}

export async function downloadPdf(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  let pdfPath = invoice.pdfPath;
  if (!pdfPath) {
    const generated = await generatePdf(ctx, id);
    pdfPath = generated.pdfPath;
  }
  const fs = await import('fs');
  if (!fs.existsSync(pdfPath)) {
    const generated = await generatePdf(ctx, id);
    pdfPath = generated.pdfPath;
  }
  await writeAudit({ ...ctx, action: 'INVOICE_PDF_DOWNLOADED', entityType: 'invoice', entityId: id, shopId });
  return { pdfPath, invoiceNumber: invoice.invoiceNumber };
}

export async function shareInvoice(ctx: ReqCtx, req: Request, id: string, input: { channel: 'LINK' | 'SMS' | 'WHATSAPP'; expiresInHours: number }) {
  const shopId = requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null }, include: { customer: true } });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  const token = randomToken(24);
  const share = await prisma.invoiceShareToken.create({
    data: {
      invoiceId: id,
      token: sha256(token),
      channel: input.channel,
      expiresAt: new Date(Date.now() + input.expiresInHours * 3600 * 1000),
      createdById: ctx.actor.accountId,
    },
  });
  const url = absoluteUrl(req, `/api/v1/billing/shared/${token}`);
  await writeAudit({ ...ctx, action: 'INVOICE_SHARED', entityType: 'invoice_share_token', entityId: share.id, shopId, metadata: { channel: input.channel } });
  return { token, url, expiresAt: share.expiresAt };
}

/** Public: resolve a share token to invoice JSON (no auth). */
export async function getSharedInvoice(token: string) {
  const share = await prisma.invoiceShareToken.findFirst({
    where: { token: sha256(token), revokedAt: null, deletedAt: null },
    include: { invoice: { include: { items: { where: { deletedAt: null } }, customer: { select: { id: true, name: true, phone: true } }, shop: { select: { id: true, name: true, phone: true, address: true, gstNumber: true } } } } },
  });
  if (!share || !share.invoice || share.invoice.deletedAt) throw new HttpError(404, 'SHARE_NOT_FOUND', 'Share link is invalid');
  if (share.expiresAt && share.expiresAt < new Date()) throw new HttpError(410, 'SHARE_EXPIRED', 'Share link has expired');
  return share.invoice;
}

export async function smsInvoiceLink(ctx: ReqCtx, req: Request, id: string, input: { phone?: string; message?: string }) {
  const shopId = requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null }, include: { customer: true } });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  const phone = input.phone ?? invoice.customer?.phone;
  if (!phone) throw new HttpError(400, 'NO_PHONE', 'No phone number available for this invoice');
  const shared = await shareInvoice(ctx, req, id, { channel: 'SMS', expiresInHours: 72 });
  const message = input.message ?? `Your invoice ${invoice.invoiceNumber} for Rs.${invoice.totalAmount.toString()} from ${invoice.shopId}. View: ${shared.url}`;
  const log = await prisma.smsLog.create({
    data: { shopId, invoiceId: id, customerId: invoice.customerId, to: phone, message, provider: 'console', status: 'QUEUED' },
  });
  await sendSms({ to: phone, message, shopId, invoiceId: id });
  await prisma.smsLog.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date() } });
  await writeAudit({ ...ctx, action: 'INVOICE_SMS_SENT', entityType: 'invoice', entityId: id, shopId, metadata: { to: phone } });
  return { sent: true, url: shared.url, smsLogId: log.id };
}

export async function whatsappInvoiceLink(ctx: ReqCtx, req: Request, id: string, input: { phone?: string; message?: string }) {
  const shopId = requireShopId(ctx);
  const invoice = await prisma.invoice.findFirst({ where: { id, shopId, deletedAt: null }, include: { customer: true, shop: true } });
  if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
  const phone = input.phone ?? invoice.customer?.phone;
  if (!phone) throw new HttpError(400, 'NO_PHONE', 'No phone number available for this invoice');
  const shared = await shareInvoice(ctx, req, id, { channel: 'WHATSAPP', expiresInHours: 72 });
  const text = input.message ?? `Your invoice ${invoice.invoiceNumber} for Rs.${invoice.totalAmount.toString()} from ${invoice.shop.name}. View: ${shared.url}`;
  const url = whatsappLink(phone, text);
  await writeAudit({ ...ctx, action: 'INVOICE_WHATSAPP_LINK', entityType: 'invoice', entityId: id, shopId });
  return { url, shareUrl: shared.url };
}

/* ------------------------------- payments ------------------------------- */

export async function createPayment(
  ctx: ReqCtx,
  input: { invoiceId?: string; purchaseId?: string; customerId?: string; supplierId?: string; amount: string; mode: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE'; direction: 'IN' | 'OUT'; paymentDate?: string; referenceNumber?: string; notes?: string },
) {
  const shopId = requireShopId(ctx);
  const amount = D(input.amount);
  if (amount.lte(0)) throw new HttpError(400, 'INVALID_AMOUNT', 'Amount must be positive');

  const payment = await prisma.$transaction(async (tx) => {
    let invoice: { id: string; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; status: string; customerId: string | null } | null = null;
    if (input.invoiceId) {
      invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, shopId, deletedAt: null } });
      if (!invoice) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
      if (invoice.status === 'CANCELLED') throw new HttpError(409, 'INVOICE_CANCELLED', 'Cannot record payment on a cancelled invoice');
    }
    let purchase: { id: string; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal } | null = null;
    if (input.purchaseId) {
      purchase = await tx.purchase.findFirst({ where: { id: input.purchaseId, shopId, deletedAt: null } });
      if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
    }
    const created = await tx.payment.create({
      data: {
        shopId,
        invoiceId: input.invoiceId,
        purchaseId: input.purchaseId,
        customerId: input.customerId ?? invoice?.customerId ?? null,
        supplierId: input.supplierId,
        amount,
        mode: input.mode ?? 'CASH',
        direction: input.direction ?? 'IN',
        paymentDate: parseDate(input.paymentDate) ?? new Date(),
        referenceNumber: input.referenceNumber,
        notes: input.notes,
        receivedById: ctx.actor.accountId,
      },
    });
    if (invoice) {
      const newPaid = invoice.paidAmount.add(amount);
      if (newPaid.gt(invoice.totalAmount)) throw new HttpError(409, 'OVERPAYMENT', 'Payment exceeds invoice balance');
      const status = invoiceStatusFor(newPaid, invoice.totalAmount, invoice.status);
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: newPaid, status } });
      if (invoice.customerId) {
        await tx.customer.update({ where: { id: invoice.customerId }, data: { outstandingBalance: { decrement: amount } } });
      }
    }
    if (purchase) {
      await tx.purchase.update({ where: { id: purchase.id }, data: { paidAmount: purchase.paidAmount.add(amount) } });
    }
    return created;
  });

  await writeAudit({ ...ctx, action: 'PAYMENT_RECORDED', entityType: 'payment', entityId: payment.id, shopId, newValue: { amount: payment.amount.toString(), invoiceId: payment.invoiceId } });
  return payment;
}

export async function listPayments(
  ctx: ReqCtx,
  query: { page: number; limit: number; invoiceId?: string; customerId?: string; direction?: 'IN' | 'OUT'; mode?: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE'; fromDate?: string; toDate?: string },
) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.PaymentWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    ...(query.fromDate || query.toDate ? { paymentDate: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({ where, skip, take, orderBy: { paymentDate: 'desc' }, include: { invoice: { select: { id: true, invoiceNumber: true } } } }),
    prisma.payment.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}
