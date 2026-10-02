import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, ZERO, getPagination, pageMeta, parseDate } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';

/** Fixed tracker categories map onto FinanceCategory rows of type EXPENSE (auto-provisioned). */
const TRACKER_CATEGORIES = ['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES', 'OTHER'] as const;
type TrackerCategory = (typeof TRACKER_CATEGORIES)[number];

const CATEGORY_LABELS: Record<TrackerCategory, string> = {
  RENT: 'Rent',
  SALARY: 'Salary',
  UTILITIES: 'Utilities',
  SUPPLIES: 'Supplies',
  OTHER: 'Other',
};

async function resolveCategory(shopId: string, category: TrackerCategory) {
  const name = CATEGORY_LABELS[category];
  let row = await prisma.financeCategory.findFirst({ where: { shopId, name, type: 'EXPENSE', deletedAt: null } });
  if (!row) {
    row = await prisma.financeCategory.create({ data: { shopId, name, type: 'EXPENSE' } });
  }
  return row;
}

function assertNotFuture(dateStr: string): Date {
  const d = parseDate(dateStr);
  if (!d) throw new HttpError(400, 'INVALID_DATE', 'Invalid expense date');
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) throw new HttpError(400, 'FUTURE_DATE', 'Expense date cannot be in the future');
  return d;
}

function toTrackerDto(row: {
  id: string;
  title: string;
  amount: Prisma.Decimal;
  expenseDate: Date;
  paymentMode: string | null;
  paidBy: string | null;
  notes: string | null;
  createdAt: Date;
  category: { id: string; name: string } | null;
}) {
  const catName = row.category?.name ?? 'Other';
  const category = (Object.keys(CATEGORY_LABELS) as TrackerCategory[]).find((k) => CATEGORY_LABELS[k] === catName) ?? 'OTHER';
  return {
    id: row.id,
    category,
    categoryName: catName,
    title: row.title,
    amount: row.amount.toString(),
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    paymentMode: row.paymentMode,
    paidBy: row.paidBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

const includeCategory = { category: { select: { id: true, name: true } } };

export async function list(ctx: ReqCtx, query: { page: number; limit: number; category?: string; search?: string; fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  let categoryId: string | undefined;
  if (query.category) {
    const cat = await prisma.financeCategory.findFirst({
      where: { shopId, name: CATEGORY_LABELS[query.category as TrackerCategory] ?? query.category, type: 'EXPENSE', deletedAt: null },
    });
    if (!cat) return { data: [], meta: pageMeta(0, query.page, query.limit) };
    categoryId = cat.id;
  }
  const where: Prisma.ExpenseWhereInput = {
    shopId,
    deletedAt: null,
    ...(categoryId ? { categoryId } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { notes: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
    ...(query.fromDate || query.toDate
      ? { expenseDate: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.expense.findMany({ where, skip, take, orderBy: { expenseDate: 'desc' }, include: includeCategory }),
    prisma.expense.count({ where }),
  ]);
  return { data: rows.map(toTrackerDto), meta: pageMeta(total, query.page, query.limit) };
}

export async function create(ctx: ReqCtx, input: { category: TrackerCategory; title: string; amount: string; expenseDate: string; paidBy?: string; paymentMode?: string; notes?: string }) {
  const shopId = requireShopId(ctx);
  const cat = await resolveCategory(shopId, input.category);
  const row = await prisma.expense.create({
    data: {
      shopId,
      categoryId: cat.id,
      title: input.title,
      amount: D(input.amount),
      expenseDate: assertNotFuture(input.expenseDate),
      paidBy: input.paidBy?.trim() || null,
      paymentMode: (input.paymentMode as never) ?? null,
      notes: input.notes?.trim() || null,
      createdById: ctx.actor.accountId,
    },
    include: includeCategory,
  });
  await writeAudit({ ...ctx, action: 'EXPENSE_CREATED', entityType: 'expense', entityId: row.id, shopId, newValue: row });
  return toTrackerDto(row);
}

export async function update(ctx: ReqCtx, id: string, input: { category?: TrackerCategory; title?: string; amount?: string; expenseDate?: string; paidBy?: string; paymentMode?: string; notes?: string }) {
  const shopId = requireShopId(ctx);
  const before = await prisma.expense.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Expense not found');
  const data: Prisma.ExpenseUpdateInput = {};
  if (input.category) {
    const cat = await resolveCategory(shopId, input.category);
    data.category = { connect: { id: cat.id } };
  }
  if (input.title !== undefined) data.title = input.title;
  if (input.amount !== undefined) data.amount = D(input.amount);
  if (input.expenseDate !== undefined) data.expenseDate = assertNotFuture(input.expenseDate);
  if (input.paidBy !== undefined) data.paidBy = input.paidBy?.trim() || null;
  if (input.paymentMode !== undefined) data.paymentMode = (input.paymentMode as never) ?? null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  const after = await prisma.expense.update({ where: { id }, data, include: includeCategory });
  await writeAudit({ ...ctx, action: 'EXPENSE_UPDATED', entityType: 'expense', entityId: id, shopId, oldValue: before, newValue: after });
  return toTrackerDto(after);
}

export async function remove(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const before = await prisma.expense.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Expense not found');
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'EXPENSE_DELETED', entityType: 'expense', entityId: id, shopId, severity: 'HIGH' });
  return { deleted: true };
}

export async function summary(ctx: ReqCtx, year: number, month: number) {
  const shopId = requireShopId(ctx);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const rows = await prisma.expense.findMany({
    where: { shopId, deletedAt: null, expenseDate: { gte: from, lte: to } },
    select: { amount: true, category: { select: { name: true } } },
  });
  const byCategory = new Map<TrackerCategory, { total: Prisma.Decimal; count: number }>();
  for (const c of TRACKER_CATEGORIES) byCategory.set(c, { total: ZERO, count: 0 });
  for (const r of rows) {
    const catName = r.category?.name ?? 'Other';
    const key = ((Object.keys(CATEGORY_LABELS) as TrackerCategory[]).find((k) => CATEGORY_LABELS[k] === catName) ?? 'OTHER') as TrackerCategory;
    const b = byCategory.get(key)!;
    b.total = b.total.add(r.amount);
    b.count += 1;
  }
  const breakdown = [...byCategory.entries()].map(([category, b]) => ({
    category,
    categoryName: CATEGORY_LABELS[category],
    total: b.total.toString(),
    count: b.count,
  }));
  const grandTotal = breakdown.reduce((a, b) => a.add(new Prisma.Decimal(b.total)), ZERO);
  return { year, month, breakdown, grandTotal: grandTotal.toString(), expenseCount: rows.length };
}

export const TRACKER_CATEGORY_LIST = TRACKER_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
