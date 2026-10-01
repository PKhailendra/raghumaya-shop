import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, ZERO, getPagination, pageMeta, parseDate } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';

type Range = { from: Date; to: Date };

function resolveRange(fromDate?: string, toDate?: string): Range {
  const now = new Date();
  const from = fromDate ? parseDate(fromDate)! : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toDate ? parseDate(toDate)! : now;
  return { from, to };
}

async function sumOf(model: 'revenue' | 'expense', shopId: string, from: Date, to: Date): Promise<Prisma.Decimal> {
  const where = { shopId, deletedAt: null };
  const rows =
    model === 'revenue'
      ? await prisma.revenue.findMany({ where: { ...where, revenueDate: { gte: from, lte: to } }, select: { amount: true } })
      : await prisma.expense.findMany({ where: { ...where, expenseDate: { gte: from, lte: to } }, select: { amount: true } });
  return rows.reduce((acc, r) => acc.add(r.amount), ZERO);
}

async function invoiceSums(shopId: string, from: Date, to: Date) {
  const rows = await prisma.invoice.findMany({
    where: { shopId, deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, issueDate: { gte: from, lte: to } },
    select: { totalAmount: true, cgstTotal: true, sgstTotal: true, igstTotal: true, taxTotal: true },
  });
  return rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue.add(r.totalAmount),
      cgst: acc.cgst.add(r.cgstTotal),
      sgst: acc.sgst.add(r.sgstTotal),
      igst: acc.igst.add(r.igstTotal),
      tax: acc.tax.add(r.taxTotal),
      count: acc.count + 1,
    }),
    { revenue: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, tax: ZERO, count: 0 },
  );
}

async function paymentSums(shopId: string, from: Date, to: Date, direction: 'IN' | 'OUT') {
  const rows = await prisma.payment.findMany({
    where: { shopId, deletedAt: null, direction, paymentDate: { gte: from, lte: to } },
    select: { amount: true },
  });
  return rows.reduce((acc, r) => acc.add(r.amount), ZERO);
}

/* ------------------------------ categories ------------------------------ */

export async function createCategory(ctx: ReqCtx, input: { name: string; type: 'INCOME' | 'EXPENSE'; description?: string }) {
  const shopId = requireShopId(ctx);
  try {
    const category = await prisma.financeCategory.create({ data: { shopId, name: input.name, type: input.type, description: input.description } });
    await writeAudit({ ...ctx, action: 'FINANCE_CATEGORY_CREATED', entityType: 'finance_category', entityId: category.id, shopId, newValue: category });
    return category;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'FINANCE_CATEGORY_EXISTS', 'A category with this name and type already exists');
    }
    throw e;
  }
}

export async function listCategories(ctx: ReqCtx, query: { page: number; limit: number; type?: 'INCOME' | 'EXPENSE' }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.FinanceCategoryWhereInput = { shopId, deletedAt: null, ...(query.type ? { type: query.type } : {}) };
  const [rows, total] = await Promise.all([
    prisma.financeCategory.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
    prisma.financeCategory.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

/* --------------------------- generic CRUD helper --------------------------- */

async function assertCategory(shopId: string, categoryId: string | undefined, expected: 'INCOME' | 'EXPENSE') {
  if (!categoryId) return;
  const cat = await prisma.financeCategory.findFirst({ where: { id: categoryId, shopId, deletedAt: null } });
  if (!cat) throw new HttpError(404, 'FINANCE_CATEGORY_NOT_FOUND', 'Finance category not found');
  if (cat.type !== expected) throw new HttpError(400, 'CATEGORY_TYPE_MISMATCH', `Category must be of type ${expected}`);
}

function crudFor(model: 'revenue' | 'expense' | 'asset' | 'liability', entityLabel: string) {
  const delegate = () => prisma[model] as unknown as {
    create(args: never): Promise<{ id: string } & Record<string, unknown>>;
    findMany(args: never): Promise<Array<Record<string, unknown>>>;
    count(args: never): Promise<number>;
    findFirst(args: never): Promise<Record<string, unknown> | null>;
    update(args: never): Promise<Record<string, unknown>>;
  };
  return {
    async create(ctx: ReqCtx, input: Record<string, unknown>) {
      const shopId = requireShopId(ctx);
      if (model === 'revenue') await assertCategory(shopId, input.categoryId as string | undefined, 'INCOME');
      if (model === 'expense') await assertCategory(shopId, input.categoryId as string | undefined, 'EXPENSE');
      const data: Record<string, unknown> = { shopId };
      const moneyFields: Record<string, string[]> = {
        revenue: ['amount'],
        expense: ['amount'],
        asset: ['purchaseValue', 'currentValue'],
        liability: ['totalAmount', 'outstandingAmount'],
      };
      for (const f of moneyFields[model]) if (input[f] !== undefined) data[f] = D(input[f] as string);
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || moneyFields[model].includes(k)) continue;
        if (k === 'categoryId' || k === 'title' || k === 'name' || k === 'source' || k === 'notes' || k === 'assetType' || k === 'liabilityType' || k === 'status' || k === 'paymentMode') {
          data[k] = v === '' ? null : v;
        } else if ((k === 'revenueDate' || k === 'expenseDate' || k === 'purchaseDate' || k === 'dueDate') && v) {
          data[k] = parseDate(v as string)!;
        }
      }
      if (model === 'revenue') {
        data.receivedById = ctx.actor.accountId;
      }
      if (model === 'expense') {
        data.createdById = ctx.actor.accountId;
      }
      const row = await delegate().create({ data } as never);
      await writeAudit({ ...ctx, action: `${entityLabel}_CREATED`, entityType: model, entityId: row.id, shopId, newValue: row });
      return row;
    },
    async list(ctx: ReqCtx, query: { page: number; limit: number; fromDate?: string; toDate?: string; categoryId?: string; search?: string }) {
      const shopId = requireShopId(ctx);
      const { skip, take } = getPagination(query.page, query.limit);
      const dateField = model === 'revenue' ? 'revenueDate' : model === 'expense' ? 'expenseDate' : 'createdAt';
      const nameField = model === 'asset' || model === 'liability' ? 'name' : 'title';
      const where: Record<string, unknown> = {
        shopId,
        deletedAt: null,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search ? { [nameField]: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(query.fromDate || query.toDate ? { [dateField]: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
      };
      const orderBy = { [dateField]: 'desc' };
      const [rows, total] = await Promise.all([
        delegate().findMany({ where, skip, take, orderBy, include: model === 'revenue' || model === 'expense' ? { category: { select: { id: true, name: true } } } : undefined } as never),
        delegate().count({ where } as never),
      ]);
      return { data: rows, meta: pageMeta(total, query.page, query.limit) };
    },
    async update(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
      const shopId = requireShopId(ctx);
      const before = await delegate().findFirst({ where: { id, shopId, deletedAt: null } } as never);
      if (!before) throw new HttpError(404, `${entityLabel}_NOT_FOUND`, `${entityLabel} not found`);
      const data: Record<string, unknown> = {};
      const moneyFields: Record<string, string[]> = {
        revenue: ['amount'],
        expense: ['amount'],
        asset: ['purchaseValue', 'currentValue'],
        liability: ['totalAmount', 'outstandingAmount'],
      };
      for (const f of moneyFields[model]) if (input[f] !== undefined) data[f] = D(input[f] as string);
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || moneyFields[model].includes(k)) continue;
        if ((k === 'revenueDate' || k === 'expenseDate' || k === 'purchaseDate' || k === 'dueDate') && v) data[k] = parseDate(v as string)!;
        else data[k] = v === '' ? null : v;
      }
      const after = await delegate().update({ where: { id }, data } as never);
      await writeAudit({ ...ctx, action: `${entityLabel}_UPDATED`, entityType: model, entityId: id, shopId, oldValue: before, newValue: after });
      return after;
    },
    async remove(ctx: ReqCtx, id: string) {
      const shopId = requireShopId(ctx);
      const before = await delegate().findFirst({ where: { id, shopId, deletedAt: null } } as never);
      if (!before) throw new HttpError(404, `${entityLabel}_NOT_FOUND`, `${entityLabel} not found`);
      await delegate().update({ where: { id }, data: { deletedAt: new Date() } } as never);
      await writeAudit({ ...ctx, action: `${entityLabel}_DELETED`, entityType: model, entityId: id, shopId, severity: 'HIGH' });
      return { deleted: true };
    },
  };
}

export const revenues = crudFor('revenue', 'REVENUE');
export const expenses = crudFor('expense', 'EXPENSE');
export const assets = crudFor('asset', 'ASSET');
export const liabilities = crudFor('liability', 'LIABILITY');

/* -------------------------------- reports -------------------------------- */

export async function dashboard(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [inv, manualRevenue, totalExpenses, cashIn, cashOut] = await Promise.all([
    invoiceSums(shopId, from, to),
    sumOf('revenue', shopId, from, to),
    sumOf('expense', shopId, from, to),
    paymentSums(shopId, from, to, 'IN'),
    paymentSums(shopId, from, to, 'OUT'),
  ]);
  const [assetRows, liabilityRows] = await Promise.all([
    prisma.asset.findMany({ where: { shopId, deletedAt: null, status: 'ACTIVE' }, select: { currentValue: true, purchaseValue: true } }),
    prisma.liability.findMany({ where: { shopId, deletedAt: null, status: 'OPEN' }, select: { outstandingAmount: true } }),
  ]);
  const assetValue = assetRows.reduce((a, r) => a.add(r.currentValue ?? r.purchaseValue), ZERO);
  const outstandingLiabilities = liabilityRows.reduce((a, r) => a.add(r.outstandingAmount), ZERO);
  const totalRevenue = inv.revenue.add(manualRevenue);
  const grossProfit = totalRevenue.sub(totalExpenses);
  return {
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    totalRevenue: totalRevenue.toString(),
    invoiceRevenue: inv.revenue.toString(),
    manualRevenue: manualRevenue.toString(),
    totalExpenses: totalExpenses.toString(),
    grossProfit: grossProfit.toString(),
    cashIn: cashIn.toString(),
    cashOut: cashOut.toString(),
    netCashFlow: cashIn.sub(cashOut).toString(),
    assetValue: assetValue.toString(),
    outstandingLiabilities: outstandingLiabilities.toString(),
    taxPayable: inv.tax.toString(),
    cgst: inv.cgst.toString(),
    sgst: inv.sgst.toString(),
    igst: inv.igst.toString(),
    invoiceCount: inv.count,
  };
}

export async function cashFlow(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const payments = await prisma.payment.findMany({
    where: { shopId, deletedAt: null, paymentDate: { gte: from, lte: to } },
    orderBy: { paymentDate: 'asc' },
    select: { paymentDate: true, direction: true, amount: true, mode: true, referenceNumber: true },
  });
  const buckets = new Map<string, { cashIn: Prisma.Decimal; cashOut: Prisma.Decimal }>();
  for (const p of payments) {
    const day = p.paymentDate.toISOString().slice(0, 10);
    const b = buckets.get(day) ?? { cashIn: ZERO, cashOut: ZERO };
    if (p.direction === 'IN') b.cashIn = b.cashIn.add(p.amount);
    else b.cashOut = b.cashOut.add(p.amount);
    buckets.set(day, b);
  }
  const series = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, b]) => ({ date, cashIn: b.cashIn.toString(), cashOut: b.cashOut.toString(), net: b.cashIn.sub(b.cashOut).toString() }));
  const totalIn = series.reduce((a, s) => a.add(new Prisma.Decimal(s.cashIn)), ZERO);
  const totalOut = series.reduce((a, s) => a.add(new Prisma.Decimal(s.cashOut)), ZERO);
  return { series, totals: { cashIn: totalIn.toString(), cashOut: totalOut.toString(), netCashFlow: totalIn.sub(totalOut).toString() } };
}

export async function profitLoss(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [inv, manualRevenue, totalExpenses] = await Promise.all([
    invoiceSums(shopId, from, to),
    sumOf('revenue', shopId, from, to),
    sumOf('expense', shopId, from, to),
  ]);
  const totalRevenue = inv.revenue.add(manualRevenue);
  const netProfit = totalRevenue.sub(totalExpenses);
  const expenseBreakdown = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: { shopId, deletedAt: null, expenseDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  const categories = await prisma.financeCategory.findMany({ where: { shopId, deletedAt: null }, select: { id: true, name: true } });
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return {
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    revenue: { invoiceRevenue: inv.revenue.toString(), manualRevenue: manualRevenue.toString(), totalRevenue: totalRevenue.toString() },
    expenses: {
      totalExpenses: totalExpenses.toString(),
      breakdown: expenseBreakdown.map((b) => ({ categoryId: b.categoryId, categoryName: b.categoryId ? catName.get(b.categoryId) ?? 'Uncategorized' : 'Uncategorized', amount: (b._sum.amount ?? ZERO).toString() })),
    },
    grossProfit: totalRevenue.sub(totalExpenses).toString(),
    netProfit: netProfit.toString(),
    profitMarginPercent: totalRevenue.gt(0) ? netProfit.div(totalRevenue).mul(100).toFixed(2) : '0.00',
  };
}

export async function revenueAnalysis(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [inv, manual] = await Promise.all([
    prisma.invoice.findMany({ where: { shopId, deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] }, issueDate: { gte: from, lte: to } }, select: { issueDate: true, totalAmount: true } }),
    prisma.revenue.findMany({ where: { shopId, deletedAt: null, revenueDate: { gte: from, lte: to } }, select: { revenueDate: true, amount: true, source: true, category: { select: { name: true } } } }),
  ]);
  const bySource = new Map<string, Prisma.Decimal>();
  for (const r of manual) {
    const key = r.source ?? r.category?.name ?? 'Manual';
    bySource.set(key, (bySource.get(key) ?? ZERO).add(r.amount));
  }
  bySource.set('Invoices', (bySource.get('Invoices') ?? ZERO).add(inv.reduce((a, i) => a.add(i.totalAmount), ZERO)));
  return {
    sources: [...bySource.entries()].map(([source, amount]) => ({ source, amount: amount.toString() })),
    invoiceCount: inv.length,
    manualCount: manual.length,
  };
}

export async function monthlyReport(ctx: ReqCtx, year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const [dash, pl, cf] = await Promise.all([
    dashboard(ctx, { fromDate: from.toISOString(), toDate: to.toISOString() }),
    profitLoss(ctx, { fromDate: from.toISOString(), toDate: to.toISOString() }),
    cashFlow(ctx, { fromDate: from.toISOString(), toDate: to.toISOString() }),
  ]);
  return { year, month, dashboard: dash, profitLoss: pl, cashFlow: cf };
}

export async function yearlyReport(ctx: ReqCtx, year: number) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const from = new Date(year, m - 1, 1);
    const to = new Date(year, m, 0, 23, 59, 59, 999);
    const [inv, exp] = await Promise.all([invoiceSums(requireShopId(ctx), from, to), sumOf('expense', requireShopId(ctx), from, to)]);
    months.push({ month: m, revenue: inv.revenue.toString(), expenses: exp.toString(), netProfit: inv.revenue.sub(exp).toString() });
  }
  const totalRevenue = months.reduce((a, m) => a.add(new Prisma.Decimal(m.revenue)), ZERO);
  const totalExpenses = months.reduce((a, m) => a.add(new Prisma.Decimal(m.expenses)), ZERO);
  return { year, months, totals: { revenue: totalRevenue.toString(), expenses: totalExpenses.toString(), netProfit: totalRevenue.sub(totalExpenses).toString() } };
}

export async function taxReport(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const inv = await invoiceSums(shopId, from, to);
  const purchaseTax = await prisma.purchase.aggregate({
    where: { shopId, deletedAt: null, status: { not: 'CANCELLED' }, purchaseDate: { gte: from, lte: to } },
    _sum: { taxTotal: true },
  });
  const inputTax = purchaseTax._sum.taxTotal ?? ZERO;
  return {
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    outputTax: { cgst: inv.cgst.toString(), sgst: inv.sgst.toString(), igst: inv.igst.toString(), total: inv.tax.toString() },
    inputTaxCredit: inputTax.toString(),
    netTaxPayable: inv.tax.sub(inputTax).toString(),
    taxableRevenue: inv.revenue.toString(),
    invoiceCount: inv.count,
  };
}
