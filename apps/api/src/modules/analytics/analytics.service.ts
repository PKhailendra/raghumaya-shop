import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ZERO, parseDate } from '../../lib/utils';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';

type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date };

function resolveRange(fromDate?: string, toDate?: string): Range {
  const now = new Date();
  const to = toDate ? parseDate(toDate)! : now;
  const from = fromDate ? parseDate(fromDate)! : new Date(to.getTime() - 30 * 86400000);
  const span = to.getTime() - from.getTime();
  return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: from };
}

async function invoiceRows(shopId: string, from: Date, to: Date) {
  return prisma.invoice.findMany({
    where: { shopId, deletedAt: null, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] }, issueDate: { gte: from, lte: to } },
    select: { id: true, issueDate: true, totalAmount: true, paidAmount: true, taxTotal: true, status: true, customerId: true, items: { where: { deletedAt: null }, select: { description: true, productId: true, quantity: true, lineTotal: true, taxableAmount: true } } },
  });
}

export async function dashboard(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [summary, chart, topProducts, topCategories, customerInsights, paymentAnalysis, stockInsights] = await Promise.all([
    salesSummary(ctx, query),
    salesChart(ctx, query),
    topProductsFn(ctx, { ...query, limit: 5 }),
    topCategoriesFn(ctx, query),
    customerInsightsFn(ctx, query),
    paymentAnalysisFn(ctx, query),
    inventoryInsights(ctx),
  ]);
  return {
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    summary,
    salesChart: chart,
    topProducts,
    topCategories,
    customerInsights,
    paymentAnalysis,
    inventoryInsights: stockInsights,
  };
}

export async function salesSummary(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to, prevFrom, prevTo } = resolveRange(query.fromDate, query.toDate);
  const agg = async (f: Date, t: Date) =>
    prisma.invoice.aggregate({
      where: { shopId, deletedAt: null, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] }, issueDate: { gte: f, lte: t } },
      _sum: { totalAmount: true, taxTotal: true },
      _count: { _all: true },
    });
  const [cur, prev] = await Promise.all([agg(from, to), agg(prevFrom, prevTo)]);
  const sales = cur._sum.totalAmount ?? ZERO;
  const prevSales = prev._sum.totalAmount ?? ZERO;
  const growth = prevSales.gt(0) ? sales.sub(prevSales).div(prevSales).mul(100).toFixed(2) : '0.00';
  return {
    totalSales: sales.toString(),
    previousTotalSales: prevSales.toString(),
    growthPercent: growth,
    invoiceCount: cur._count._all,
    averageOrderValue: cur._count._all > 0 ? sales.div(cur._count._all).toFixed(2) : '0.00',
    totalTax: (cur._sum.taxTotal ?? ZERO).toString(),
  };
}

export async function salesChart(ctx: ReqCtx, query: { fromDate?: string; toDate?: string; groupBy?: 'day' | 'week' | 'month' }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const groupBy = query.groupBy ?? 'day';
  const rows = await invoiceRows(shopId, from, to);
  const buckets = new Map<string, { sales: Prisma.Decimal; orders: number }>();
  for (const r of rows) {
    const d = r.issueDate;
    let key: string;
    if (groupBy === 'month') key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    else if (groupBy === 'week') {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      key = start.toISOString().slice(0, 10);
    } else key = d.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { sales: ZERO, orders: 0 };
    b.sales = b.sales.add(r.totalAmount);
    b.orders += 1;
    buckets.set(key, b);
  }
  return {
    groupBy,
    series: [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, b]) => ({ period, sales: b.sales.toString(), orders: b.orders })),
  };
}

export async function topProductsFn(ctx: ReqCtx, query: { fromDate?: string; toDate?: string; limit?: number }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const limit = Math.min(query.limit ?? 10, 50);
  const rows = await invoiceRows(shopId, from, to);
  const byProduct = new Map<string, { description: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal; orders: number }>();
  for (const r of rows) {
    for (const item of r.items) {
      const key = item.productId ?? item.description;
      const b = byProduct.get(key) ?? { description: item.description, quantity: ZERO, revenue: ZERO, orders: 0 };
      b.quantity = b.quantity.add(item.quantity);
      b.revenue = b.revenue.add(item.lineTotal);
      b.orders += 1;
      byProduct.set(key, b);
    }
  }
  return [...byProduct.entries()]
    .map(([id, b]) => ({ productId: id, ...b, quantity: b.quantity.toString(), revenue: b.revenue.toString() }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, limit);
}

export async function topCategoriesFn(ctx: ReqCtx, query: { fromDate?: string; toDate?: string; limit?: number }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const limit = Math.min(query.limit ?? 10, 50);
  const rows = await invoiceRows(shopId, from, to);
  const productIds = new Set(rows.flatMap((r) => r.items.map((i) => i.productId).filter(Boolean) as string[]));
  const products = await prisma.product.findMany({ where: { id: { in: [...productIds] }, shopId }, select: { id: true, category: { select: { id: true, name: true } } } });
  const catOf = new Map(products.map((p) => [p.id, p.category]));
  const byCat = new Map<string, { name: string; revenue: Prisma.Decimal; quantity: Prisma.Decimal }>();
  for (const r of rows) {
    for (const item of r.items) {
      const cat = item.productId ? catOf.get(item.productId) : null;
      const key = cat?.id ?? 'uncategorized';
      const b = byCat.get(key) ?? { name: cat?.name ?? 'Uncategorized', revenue: ZERO, quantity: ZERO };
      b.revenue = b.revenue.add(item.lineTotal);
      b.quantity = b.quantity.add(item.quantity);
      byCat.set(key, b);
    }
  }
  return [...byCat.entries()]
    .map(([categoryId, b]) => ({ categoryId, name: b.name, revenue: b.revenue.toString(), quantity: b.quantity.toString() }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, limit);
}

export async function customerInsightsFn(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [totalCustomers, newCustomers, invoices] = await Promise.all([
    prisma.customer.count({ where: { shopId, deletedAt: null } }),
    prisma.customer.count({ where: { shopId, deletedAt: null, createdAt: { gte: from, lte: to } } }),
    prisma.invoice.findMany({ where: { shopId, deletedAt: null, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] }, customerId: { not: null }, issueDate: { gte: from, lte: to } }, select: { customerId: true, totalAmount: true } }),
  ]);
  const spend = new Map<string, Prisma.Decimal>();
  for (const i of invoices) spend.set(i.customerId!, (spend.get(i.customerId!) ?? ZERO).add(i.totalAmount));
  const top = [...spend.entries()].sort((a, b) => (b[1].gt(a[1]) ? 1 : -1)).slice(0, 10);
  const customers = await prisma.customer.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, name: true, phone: true } });
  const nameOf = new Map(customers.map((c) => [c.id, c]));
  return {
    totalCustomers,
    newCustomers,
    repeatCustomers: spend.size,
    topCustomers: top.map(([id, amount]) => ({ customerId: id, name: nameOf.get(id)?.name ?? 'Unknown', phone: nameOf.get(id)?.phone ?? null, totalSpent: amount.toString() })),
  };
}

export async function paymentAnalysisFn(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const [byMode, invoices] = await Promise.all([
    prisma.payment.groupBy({ by: ['mode'], where: { shopId, deletedAt: null, direction: 'IN', paymentDate: { gte: from, lte: to } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({
      where: { shopId, deletedAt: null, issueDate: { gte: from, lte: to }, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
  ]);
  const billed = invoices._sum.totalAmount ?? ZERO;
  const collected = invoices._sum.paidAmount ?? ZERO;
  return {
    byMode: byMode.map((b) => ({ mode: b.mode, amount: (b._sum.amount ?? ZERO).toString(), count: b._count._all })),
    outstanding: {
      amount: billed.sub(collected).toString(),
      invoiceCount: invoices._count._all,
      collectionRatePercent: billed.gt(0) ? collected.div(billed).mul(100).toFixed(2) : '0.00',
    },
  };
}

export async function inventoryInsights(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  const since90 = new Date(Date.now() - 90 * 86400000);
  const [totalProducts, products, soldProductIds, expiring] = await Promise.all([
    prisma.product.count({ where: { shopId, deletedAt: null } }),
    prisma.product.findMany({ where: { shopId, deletedAt: null }, select: { id: true, currentStock: true, reorderLevel: true } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { shopId, deletedAt: null, issueDate: { gte: since90 } }, productId: { not: null }, deletedAt: null },
      select: { productId: true },
    }),
    prisma.productBatch.count({ where: { product: { shopId }, deletedAt: null, expiryDate: { lte: new Date(Date.now() + 30 * 86400000) } } }),
  ]);
  const lowStock = products.filter((p) => p.currentStock.lte(p.reorderLevel)).length;
  const outOfStock = products.filter((p) => p.currentStock.lte(0)).length;
  const sold = new Set(soldProductIds.map((r) => r.productId).filter(Boolean) as string[]);
  const deadStock90d = products.filter((p) => p.currentStock.gt(0) && !sold.has(p.id)).length;
  return { totalProducts, lowStock, outOfStock, expiringBatches: expiring, deadStock90d };
}

export async function profitAnalysis(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const rows = await invoiceRows(shopId, from, to);
  const revenue = rows.reduce((a, r) => a.add(r.totalAmount), ZERO);
  const cogs = rows.reduce((a, r) => a.add(r.items.reduce((x, i) => x.add(i.taxableAmount), ZERO)), ZERO);
  const grossProfit = revenue.sub(cogs);
  const expenses = await prisma.expense.findMany({ where: { shopId, deletedAt: null, expenseDate: { gte: from, lte: to } }, select: { amount: true } });
  const totalExpenses = expenses.reduce((a, e) => a.add(e.amount), ZERO);
  const netProfit = grossProfit.sub(totalExpenses);
  return {
    revenue: revenue.toString(),
    grossProfit: grossProfit.toString(),
    grossMarginPercent: revenue.gt(0) ? grossProfit.div(revenue).mul(100).toFixed(2) : '0.00',
    operatingExpenses: totalExpenses.toString(),
    netProfit: netProfit.toString(),
    netMarginPercent: revenue.gt(0) ? netProfit.div(revenue).mul(100).toFixed(2) : '0.00',
  };
}

export async function revenueByPaymentMethod(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const byMode = await prisma.payment.groupBy({ by: ['mode'], where: { shopId, deletedAt: null, direction: 'IN', paymentDate: { gte: from, lte: to } }, _sum: { amount: true }, _count: { _all: true } });
  return byMode.map((b) => ({ mode: b.mode, amount: (b._sum.amount ?? ZERO).toString(), count: b._count._all }));
}

export async function customerGrowth(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const rows = await prisma.customer.findMany({ where: { shopId, deletedAt: null, createdAt: { gte: from, lte: to } }, select: { createdAt: true } });
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return {
    series: [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, count]) => ({ date, newCustomers: count })),
    totalNew: rows.length,
  };
}

export async function productPerformance(ctx: ReqCtx, query: { fromDate?: string; toDate?: string; limit?: number; sortBy?: 'revenue' | 'quantity' | 'margin' }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const limit = Math.min(query.limit ?? 20, 100);
  const rows = await invoiceRows(shopId, from, to);
  const byProduct = new Map<string, { description: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal; profit: Prisma.Decimal }>();
  for (const r of rows) {
    for (const item of r.items) {
      const key = item.productId ?? item.description;
      const b = byProduct.get(key) ?? { description: item.description, quantity: ZERO, revenue: ZERO, profit: ZERO };
      b.quantity = b.quantity.add(item.quantity);
      b.revenue = b.revenue.add(item.lineTotal);
      b.profit = b.profit.add(item.taxableAmount);
      byProduct.set(key, b);
    }
  }
  const sortKey = query.sortBy ?? 'revenue';
  return [...byProduct.entries()]
    .map(([productId, b]) => {
      const revenue = b.revenue;
      const margin = revenue.gt(0) ? b.profit.div(revenue).mul(100).toFixed(2) : '0.00';
      return { productId, description: b.description, quantity: b.quantity.toString(), revenue: revenue.toString(), profit: b.profit.toString(), margin };
    })
    .sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]))
    .slice(0, limit);
}

export async function staffPerformance(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { from, to } = resolveRange(query.fromDate, query.toDate);
  const rows = await prisma.invoice.findMany({
    where: { shopId, deletedAt: null, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] }, issueDate: { gte: from, lte: to } },
    select: { createdById: true, totalAmount: true },
  });
  const byStaff = new Map<string, { revenue: Prisma.Decimal; invoices: number }>();
  for (const r of rows) {
    const key = r.createdById ?? 'unknown';
    const b = byStaff.get(key) ?? { revenue: ZERO, invoices: 0 };
    b.revenue = b.revenue.add(r.totalAmount);
    b.invoices += 1;
    byStaff.set(key, b);
  }
  const staff = await prisma.account.findMany({ where: { id: { in: [...byStaff.keys()] } }, select: { id: true, fullName: true, email: true } });
  const nameOf = new Map(staff.map((s) => [s.id, s]));
  return [...byStaff.entries()]
    .map(([accountId, b]) => ({ accountId, name: nameOf.get(accountId)?.fullName ?? 'Unknown', email: nameOf.get(accountId)?.email ?? null, revenue: b.revenue.toString(), invoices: b.invoices }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}
