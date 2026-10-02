import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ZERO, startOfDay, endOfDay } from '../../lib/utils';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import { HttpError } from '../../middleware/errorHandler';

const ACTIVE_STATUSES = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyClosing {
  date: string;
  sales: {
    totalSales: string;
    invoiceCount: number;
    byStatus: { status: string; count: number; amount: string }[];
    averageOrderValue: string;
  };
  collections: {
    totalCollected: string;
    byMode: { mode: string; count: number; amount: string }[];
  };
  credit: {
    newDue: string;
    dueInvoiceCount: number;
  };
  expenses: {
    totalExpenses: string;
    count: number;
  };
  salary: {
    salaryPaid: string;
    count: number;
  };
  cash: {
    netCash: string;
    note: string;
  };
  topProducts: { productId: string | null; description: string; quantity: string; revenue: string }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    customerName: string | null;
    status: string;
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
    issueDate: string;
  }[];
}

export async function dailyClosing(ctx: ReqCtx, dateStr?: string): Promise<DailyClosing> {
  const shopId = requireShopId(ctx);
  const raw = (dateStr ?? '').trim();
  const day = raw || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(day)) {
    throw new HttpError(400, 'INVALID_DATE', 'Query param date must be YYYY-MM-DD');
  }
  const from = startOfDay(new Date(`${day}T00:00:00`));
  const to = endOfDay(new Date(`${day}T00:00:00`));

  const invoiceWhere = {
    shopId,
    deletedAt: null,
    status: { in: ACTIVE_STATUSES },
    issueDate: { gte: from, lte: to },
  };

  const [invoices, payments, expenses, salaryPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        issueDate: true,
        customer: { select: { name: true } },
        items: {
          where: { deletedAt: null },
          select: { description: true, productId: true, quantity: true, lineTotal: true },
        },
      },
    }),
    prisma.payment.findMany({
      where: { shopId, deletedAt: null, direction: 'IN', paymentDate: { gte: from, lte: to } },
      select: { amount: true, mode: true },
    }),
    prisma.expense.findMany({
      where: { shopId, deletedAt: null, expenseDate: { gte: from, lte: to } },
      select: { amount: true, title: true },
    }),
    prisma.salaryPayment.findMany({
      where: { shopId, paidAt: { gte: from, lte: to } },
      select: { netPayable: true, paidAmount: true },
    }),
  ]);

  // --- Sales ---
  const totalSales = invoices.reduce((a, i) => a.add(i.totalAmount), ZERO);
  const byStatusMap = new Map<string, { count: number; amount: Prisma.Decimal }>();
  for (const i of invoices) {
    const b = byStatusMap.get(i.status) ?? { count: 0, amount: ZERO };
    b.count += 1;
    b.amount = b.amount.add(i.totalAmount);
    byStatusMap.set(i.status, b);
  }

  // --- Collections (payments IN by mode) ---
  const totalCollected = payments.reduce((a, p) => a.add(p.amount), ZERO);
  const byModeMap = new Map<string, { count: number; amount: Prisma.Decimal }>();
  for (const p of payments) {
    const b = byModeMap.get(p.mode) ?? { count: 0, amount: ZERO };
    b.count += 1;
    b.amount = b.amount.add(p.amount);
    byModeMap.set(p.mode, b);
  }

  // --- New credit (due added today = billed minus paid on today's invoices) ---
  let newDue = ZERO;
  let dueInvoiceCount = 0;
  for (const i of invoices) {
    const due = i.totalAmount.sub(i.paidAmount);
    if (due.gt(0)) {
      newDue = newDue.add(due);
      dueInvoiceCount += 1;
    }
  }

  // --- Expenses ---
  const totalExpenses = expenses.reduce((a, e) => a.add(e.amount), ZERO);

  // --- Salary paid today ---
  const salaryPaid = salaryPayments.reduce((a, s) => a.add(s.netPayable), ZERO);

  // --- Net cash for the day: collected - expenses - salary ---
  const netCash = totalCollected.sub(totalExpenses).sub(salaryPaid);

  // --- Top products ---
  const byProduct = new Map<string, { description: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal }>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const key = item.productId ?? item.description;
      const b = byProduct.get(key) ?? { description: item.description, quantity: ZERO, revenue: ZERO };
      b.quantity = b.quantity.add(item.quantity);
      b.revenue = b.revenue.add(item.lineTotal);
      byProduct.set(key, b);
    }
  }
  const topProducts = [...byProduct.entries()]
    .map(([productId, b]) => ({
      productId: productId === b.description ? null : productId,
      description: b.description,
      quantity: b.quantity.toString(),
      revenue: b.revenue.toString(),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 5);

  return {
    date: day,
    sales: {
      totalSales: totalSales.toString(),
      invoiceCount: invoices.length,
      byStatus: [...byStatusMap.entries()].map(([status, b]) => ({ status, count: b.count, amount: b.amount.toString() })),
      averageOrderValue: invoices.length > 0 ? totalSales.div(invoices.length).toFixed(2) : '0.00',
    },
    collections: {
      totalCollected: totalCollected.toString(),
      byMode: [...byModeMap.entries()].map(([mode, b]) => ({ mode, count: b.count, amount: b.amount.toString() })),
    },
    credit: {
      newDue: newDue.toString(),
      dueInvoiceCount,
    },
    expenses: {
      totalExpenses: totalExpenses.toString(),
      count: expenses.length,
    },
    salary: {
      salaryPaid: salaryPaid.toString(),
      count: salaryPayments.length,
    },
    cash: {
      netCash: netCash.toString(),
      note: 'Collected − expenses − salary paid today. Opening cash balance is not tracked yet.',
    },
    topProducts,
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerName: i.customer?.name ?? null,
      status: i.status,
      totalAmount: i.totalAmount.toString(),
      paidAmount: i.paidAmount.toString(),
      balanceAmount: i.totalAmount.sub(i.paidAmount).toString(),
      issueDate: i.issueDate.toISOString(),
    })),
  };
}
