import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { getPagination, pageMeta } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { PlanCode, BillingCycle } from '@raghumaya/shared';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';

const PLAN_RANK: PlanCode[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const DEFAULT_LIMITS: Record<PlanCode, Record<string, number>> = {
  FREE: { maxProducts: 50, maxInvoicesPerMonth: 20, maxUsers: 2, maxShops: 1, maxCustomers: 100 },
  STARTER: { maxProducts: 500, maxInvoicesPerMonth: 200, maxUsers: 5, maxShops: 1, maxCustomers: 1000 },
  PROFESSIONAL: { maxProducts: 5000, maxInvoicesPerMonth: 2000, maxUsers: 15, maxShops: 3, maxCustomers: 10000 },
  ENTERPRISE: { maxProducts: 100000, maxInvoicesPerMonth: 50000, maxUsers: 100, maxShops: 20, maxCustomers: 1000000 },
};

const DEFAULT_FEATURES: Record<PlanCode, string[]> = {
  FREE: ['inventory', 'basic-billing'],
  STARTER: ['inventory', 'basic-billing', 'customers', 'finance'],
  PROFESSIONAL: ['inventory', 'basic-billing', 'customers', 'finance', 'analytics', 'barcode', 'multi-warehouse', 'reminders'],
  ENTERPRISE: ['inventory', 'basic-billing', 'customers', 'finance', 'analytics', 'barcode', 'multi-warehouse', 'reminders', 'api-access', 'priority-support'],
};

async function activeSubscription(shopId: string) {
  return prisma.subscription.findFirst({
    where: { shopId, deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
}

async function ensurePlansSeeded() {
  const count = await prisma.subscriptionPlan.count({ where: { deletedAt: null } });
  if (count > 0) return;
  const prices: Record<PlanCode, { monthly: string; yearly: string; trial: number }> = {
    FREE: { monthly: '0', yearly: '0', trial: 0 },
    STARTER: { monthly: '499', yearly: '4990', trial: 14 },
    PROFESSIONAL: { monthly: '999', yearly: '9990', trial: 14 },
    ENTERPRISE: { monthly: '2499', yearly: '24990', trial: 30 },
  };
  for (const [i, code] of PLAN_RANK.entries()) {
    await prisma.subscriptionPlan.create({
      data: {
        code,
        name: code.charAt(0) + code.slice(1).toLowerCase(),
        monthlyPrice: new Prisma.Decimal(prices[code].monthly),
        yearlyPrice: new Prisma.Decimal(prices[code].yearly),
        trialDays: prices[code].trial,
        features: DEFAULT_FEATURES[code],
        limits: DEFAULT_LIMITS[code],
        sortOrder: i,
      },
    });
  }
}

export async function getPlans(query: { activeOnly: boolean }) {
  await ensurePlansSeeded();
  return prisma.subscriptionPlan.findMany({
    where: { ...(query.activeOnly ? { isActive: true } : {}), deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
}

function withPlanDetails<T extends { plan: { code: PlanCode; features: unknown; limits: unknown } }>(sub: T) {
  return {
    ...sub,
    planCode: sub.plan.code,
    features: (sub.plan.features as string[]) ?? DEFAULT_FEATURES[sub.plan.code] ?? [],
    limits: (sub.plan.limits as Record<string, number>) ?? DEFAULT_LIMITS[sub.plan.code] ?? {},
  };
}

export async function getCurrent(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  await ensurePlansSeeded();
  let sub = await activeSubscription(shopId);
  if (!sub) {
    const plan = await prisma.subscriptionPlan.findFirst({ where: { code: 'FREE', deletedAt: null } });
    if (!plan) throw new HttpError(500, 'NO_PLANS', 'No subscription plans configured');
    sub = await prisma.subscription.create({
      data: { shopId, planId: plan.id, status: 'ACTIVE', billingCycle: 'MONTHLY', startDate: new Date(), amount: plan.monthlyPrice, autoRenew: false },
      include: { plan: true },
    });
  }
  return withPlanDetails(sub);
}

export async function getHistory(ctx: ReqCtx, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where = { shopId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    prisma.subscription.count({ where }),
  ]);
  return { data: rows.map(withPlanDetails), meta: pageMeta(total, query.page, query.limit) };
}

export async function getLimits(ctx: ReqCtx) {
  const sub = await getCurrent(ctx);
  const shopId = requireShopId(ctx);
  const limits = (sub.limits ?? {}) as Record<string, number>;
  const [productCount, customerCount, userCount, invoiceCount, shopCount] = await Promise.all([
    prisma.product.count({ where: { shopId, deletedAt: null } }),
    prisma.customer.count({ where: { shopId, deletedAt: null } }),
    prisma.shopMembership.count({ where: { shopId, status: 'ACTIVE' } }),
    prisma.invoice.count({ where: { shopId, deletedAt: null, issueDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    prisma.shopMembership.findMany({ where: { accountId: ctx.actor.accountId!, status: 'ACTIVE' }, select: { shopId: true } }).then((rows) => new Set(rows.map((r) => r.shopId)).size),
  ]);
  const used: Record<string, number> = {
    maxProducts: productCount,
    maxCustomers: customerCount,
    maxUsers: userCount,
    maxInvoicesPerMonth: invoiceCount,
    maxShops: shopCount,
  };
  const usage: Record<string, { used: number; limit: number; remaining: number }> = {};
  for (const [key, usedCount] of Object.entries(used)) {
    const limit = limits[key] ?? -1;
    usage[key] = { used: usedCount, limit, remaining: limit < 0 ? -1 : Math.max(0, limit - usedCount) };
  }
  return { planCode: sub.planCode, status: sub.status, usage };
}

export async function getFeatures(ctx: ReqCtx) {
  const sub = await getCurrent(ctx);
  return { planCode: sub.planCode, features: sub.features };
}

async function checkDowngradeUsage(shopId: string, newPlan: PlanCode) {
  const limits = DEFAULT_LIMITS[newPlan];
  const [productCount, customerCount, userCount] = await Promise.all([
    prisma.product.count({ where: { shopId, deletedAt: null } }),
    prisma.customer.count({ where: { shopId, deletedAt: null } }),
    prisma.shopMembership.count({ where: { shopId, status: 'ACTIVE' } }),
  ]);
  const overages: string[] = [];
  if (productCount > limits.maxProducts) overages.push(`products (${productCount}/${limits.maxProducts})`);
  if (customerCount > limits.maxCustomers) overages.push(`customers (${customerCount}/${limits.maxCustomers})`);
  if (userCount > limits.maxUsers) overages.push(`users (${userCount}/${limits.maxUsers})`);
  if (overages.length > 0) {
    throw new HttpError(409, 'DOWNGRADE_BLOCKED', `Cannot downgrade: usage exceeds ${newPlan} limits — ${overages.join(', ')}`);
  }
}

export async function changePlan(ctx: ReqCtx, input: { planCode: PlanCode; billingCycle: BillingCycle; startTrial: boolean }) {
  const shopId = requireShopId(ctx);
  const plan = await prisma.subscriptionPlan.findFirst({ where: { code: input.planCode, isActive: true, deletedAt: null } });
  if (!plan) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Plan not found');
  const current = await getCurrent(ctx);
  if (PLAN_RANK.indexOf(plan.code) < PLAN_RANK.indexOf(current.planCode)) {
    await checkDowngradeUsage(shopId, plan.code);
  }
  const price = input.billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
  const trialDays = input.startTrial ? plan.trialDays : 0;
  const sub = await prisma.$transaction(async (tx) => {
    const active = await tx.subscription.findFirst({ where: { shopId, deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } }, orderBy: { createdAt: 'desc' } });
    if (active) await tx.subscription.update({ where: { id: active.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Plan changed' } });
    return tx.subscription.create({
      data: {
        shopId,
        planId: plan.id,
        status: trialDays > 0 ? 'TRIAL' : 'ACTIVE',
        billingCycle: input.billingCycle,
        startDate: new Date(),
        trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 86400000) : null,
        amount: trialDays > 0 ? new Prisma.Decimal(0) : price,
        autoRenew: true,
      },
      include: { plan: true },
    });
  });
  await writeAudit({ ...ctx, action: 'SUBSCRIPTION_CHANGED', entityType: 'subscription', entityId: sub.id, shopId, oldValue: { planCode: current.planCode }, newValue: { planCode: plan.code, billingCycle: input.billingCycle } });
  return withPlanDetails(sub);
}

export async function cancelSubscription(ctx: ReqCtx, input: { reason?: string }) {
  const shopId = requireShopId(ctx);
  const sub = await activeSubscription(shopId);
  if (!sub) throw new HttpError(404, 'SUBSCRIPTION_NOT_FOUND', 'No active subscription');
  const after = await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason } });
  await writeAudit({ ...ctx, action: 'SUBSCRIPTION_CANCELLED', entityType: 'subscription', entityId: sub.id, shopId, oldValue: { status: sub.status }, newValue: { status: 'CANCELLED' } });
  return after;
}

/* ------------------------------ platform admin ------------------------------ */

export async function adminAssign(ctx: ReqCtx, input: { shopId: string; planCode: PlanCode; billingCycle: BillingCycle; status: 'TRIAL' | 'ACTIVE'; trialDays: number }) {
  const shopId = input.shopId;
  const shop = await prisma.shop.findFirst({ where: { id: shopId, deletedAt: null } });
  if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found');
  const plan = await prisma.subscriptionPlan.findFirst({ where: { code: input.planCode, isActive: true, deletedAt: null } });
  if (!plan) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Plan not found');
  const trialDays = input.status === 'TRIAL' ? input.trialDays || plan.trialDays : 0;
  const sub = await prisma.$transaction(async (tx) => {
    const active = await tx.subscription.findFirst({ where: { shopId, deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } }, orderBy: { createdAt: 'desc' } });
    if (active) await tx.subscription.update({ where: { id: active.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Admin reassigned' } });
    return tx.subscription.create({
      data: {
        shopId,
        planId: plan.id,
        status: input.status,
        billingCycle: input.billingCycle,
        startDate: new Date(),
        trialEndsAt: trialDays > 0 ? new Date(Date.now() + trialDays * 86400000) : null,
        amount: input.status === 'TRIAL' ? new Prisma.Decimal(0) : input.billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice,
        autoRenew: false,
      },
      include: { plan: true },
    });
  });
  await writeAudit({ ...ctx, action: 'SUBSCRIPTION_ADMIN_ASSIGNED', entityType: 'subscription', entityId: sub.id, shopId, newValue: { planCode: plan.code, status: input.status }, severity: 'HIGH' });
  return withPlanDetails(sub);
}
