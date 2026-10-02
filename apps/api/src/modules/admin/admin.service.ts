import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/crypto';
import { writeAudit } from '../../lib/audit';
import { getPagination, pageMeta, parseDate } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { PlanCode } from '@raghumaya/shared';
import type { ReqCtx } from '../ctx';

const ACCOUNT_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/* ------------------------------- dashboard ------------------------------- */

export async function platformDashboard() {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const invoiceWhere = (from: Date): Prisma.InvoiceWhereInput => ({
    deletedAt: null,
    status: { notIn: ['DRAFT', 'CANCELLED'] },
    issueDate: { gte: from },
  });
  const sumInvoices = async (from: Date) => {
    const r = await prisma.invoice.aggregate({ where: invoiceWhere(from), _sum: { totalAmount: true } });
    return (r._sum.totalAmount ?? new Prisma.Decimal(0)).toString();
  };

  const [
    totalShops, activeShops, suspendedShops, newTodayShops, newMonthShops,
    totalUsers, activeUsers, suspendedUsers,
    subsByPlan,
    dailyRevenue, weeklyRevenue, monthlyRevenue, yearlyRevenue, totalRevenue,
    pendingAgg, subscriptionRenewals,
  ] = await Promise.all([
    prisma.shop.count({ where: { deletedAt: null } }),
    prisma.shop.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.shop.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.shop.count({ where: { deletedAt: null, createdAt: { gte: startOfDay } } }),
    prisma.shop.count({ where: { deletedAt: null, createdAt: { gte: startOfMonth } } }),
    prisma.account.count({ where: { deletedAt: null } }),
    prisma.account.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.account.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.subscription.groupBy({
      by: ['planId'],
      where: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
      _count: { _all: true },
    }),
    sumInvoices(startOfDay),
    sumInvoices(startOfWeek),
    sumInvoices(startOfMonth),
    sumInvoices(startOfYear),
    sumInvoices(new Date(0)),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.subscription.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
  ]);

  const planIds = subsByPlan.map((s) => s.planId);
  const plans = await prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, code: true } });
  const codeOf = new Map(plans.map((p) => [p.id, p.code]));
  const byPlan: Record<string, number> = { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
  for (const s of subsByPlan) {
    const code = codeOf.get(s.planId);
    if (code) byPlan[code] = (byPlan[code] ?? 0) + s._count._all;
  }
  const pending = (pendingAgg._sum.totalAmount ?? new Prisma.Decimal(0)).sub(pendingAgg._sum.paidAmount ?? new Prisma.Decimal(0));

  return {
    shops: {
      total: totalShops,
      active: activeShops,
      inactive: suspendedShops,
      blocked: 0,
      newToday: newTodayShops,
      newThisMonth: newMonthShops,
    },
    revenue: { daily: dailyRevenue, weekly: weeklyRevenue, monthly: monthlyRevenue, yearly: yearlyRevenue },
    users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers },
    subscriptions: { free: byPlan.FREE ?? 0, starter: byPlan.STARTER ?? 0, professional: byPlan.PROFESSIONAL ?? 0, enterprise: byPlan.ENTERPRISE ?? 0 },
    finance: {
      totalPlatformRevenue: totalRevenue,
      pendingPayments: pending.toString(),
      subscriptionRenewals,
    },
  };
}

/** Platform finance summary for the admin finance page. */
export async function financeSummary() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const liveInvoice: Prisma.InvoiceWhereInput = { deletedAt: null, status: { notIn: ['DRAFT', 'CANCELLED'] } };
  const sum = async (where: Prisma.InvoiceWhereInput) =>
    ((await prisma.invoice.aggregate({ where, _sum: { totalAmount: true } }))._sum.totalAmount ?? new Prisma.Decimal(0)).toString();

  const [totalRevenue, monthlyRevenue, annualRevenue, pendingAgg, subscriptionRenewals] = await Promise.all([
    sum(liveInvoice),
    sum({ ...liveInvoice, issueDate: { gte: startOfMonth } }),
    sum({ ...liveInvoice, issueDate: { gte: startOfYear } }),
    prisma.invoice.aggregate({ where: { ...liveInvoice, status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] } }, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.subscription.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
  ]);
  const pending = (pendingAgg._sum.totalAmount ?? new Prisma.Decimal(0)).sub(pendingAgg._sum.paidAmount ?? new Prisma.Decimal(0));

  // Monthly revenue series for the last 12 months
  const revenueGrowth: Array<{ date: string; revenue: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const r = await prisma.invoice.aggregate({
      where: { ...liveInvoice, issueDate: { gte: from, lt: to } },
      _sum: { totalAmount: true },
    });
    revenueGrowth.push({
      date: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
      revenue: (r._sum.totalAmount ?? new Prisma.Decimal(0)).toString(),
    });
  }

  return {
    totalRevenue,
    monthlyRevenue,
    annualRevenue,
    pendingPayments: pending.toString(),
    revenueGrowth,
    failedPayments: 0,
    subscriptionRenewals,
  };
}

/* --------------------------------- shops --------------------------------- */

export async function listShops(ctx: ReqCtx, query: { page: number; limit: number; search?: string; status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.ShopWhereInput = {
    deletedAt: null,
    ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.shop.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.shop.count({ where }),
  ]);
  void ctx;
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function getShop(id: string) {
  const shop = await prisma.shop.findFirst({
    where: { id, deletedAt: null },
    include: {
      memberships: {
        where: { deletedAt: null },
        include: { account: { select: { id: true, fullName: true, email: true, phone: true, status: true } } },
        orderBy: { createdAt: 'asc' },
      },
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 3, include: { plan: true } },
    },
  });
  if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found');
  const recentActivity = await prisma.auditLog.findMany({
    where: { shopId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, action: true, actorType: true, actorId: true, entityType: true, createdAt: true },
  });
  const members = shop.memberships.map((m) => ({
    id: m.id,
    accountId: m.accountId,
    name: m.account?.fullName ?? null,
    fullName: m.account?.fullName ?? null,
    email: m.account?.email ?? null,
    phone: m.account?.phone ?? null,
    role: m.role,
    status: m.status,
    permissions: m.permissions,
    joinedAt: m.joinedAt,
  }));
  const subscription = shop.subscriptions[0]
    ? {
        ...shop.subscriptions[0],
        planName: shop.subscriptions[0].plan?.name ?? null,
        planCode: shop.subscriptions[0].plan?.code ?? null,
      }
    : null;
  const owner = members.find((m) => m.role === 'OWNER') ?? null;
  return {
    ...shop,
    members,
    memberships: members,
    subscription,
    subscriptions: shop.subscriptions,
    recentActivity,
    ownerName: owner?.name ?? null,
  };
}

export async function updateShop(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
  const before = await getShop(id);
  const data: Record<string, unknown> = {};
  for (const k of ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode', 'gstNumber', 'shopType', 'logoUrl', 'timezone'] as const) {
    if (input[k] !== undefined) data[k] = (input[k] as string) || null;
  }
  if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
  const after = await prisma.shop.update({ where: { id }, data: data as Prisma.ShopUpdateInput });
  await writeAudit({ ...ctx, action: 'SHOP_ADMIN_UPDATED', entityType: 'shop', entityId: id, shopId: id, oldValue: { name: before.name }, newValue: { name: after.name }, severity: 'HIGH' });
  return after;
}

export async function suspendShop(ctx: ReqCtx, id: string, input: { reason?: string }) {
  await getShop(id);
  const after = await prisma.shop.update({ where: { id }, data: { status: 'SUSPENDED' } });
  await writeAudit({ ...ctx, action: 'SHOP_SUSPENDED', entityType: 'shop', entityId: id, shopId: id, newValue: { status: 'SUSPENDED', reason: input.reason }, severity: 'HIGH' });
  return after;
}

export async function reactivateShop(ctx: ReqCtx, id: string) {
  await getShop(id);
  const after = await prisma.shop.update({ where: { id }, data: { status: 'ACTIVE' } });
  await writeAudit({ ...ctx, action: 'SHOP_REACTIVATED', entityType: 'shop', entityId: id, shopId: id, newValue: { status: 'ACTIVE' }, severity: 'HIGH' });
  return after;
}

/** Soft-delete a shop (Super Admin only). Members keep their accounts. */
export async function deleteShop(ctx: ReqCtx, id: string) {
  await getShop(id);
  const after = await prisma.shop.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'SHOP_DELETED', entityType: 'shop', entityId: id, shopId: id, newValue: { deleted: true }, severity: 'HIGH' });
  return { id: after.id, deleted: true };
}

/** Platform-wide audit logs for the admin audit-logs page (actor names hydrated). */
export async function platformAuditLogs(
  ctx: ReqCtx,
  query: { page: number; limit: number; action?: string; entityType?: string; fromDate?: string; toDate?: string },
) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.AuditLogWhereInput = {
    deletedAt: null,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.fromDate || query.toDate
      ? { createdAt: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  void ctx;
  const accountIds = [...new Set(rows.filter((r) => r.actorType === 'account').map((r) => r.actorId))];
  const adminIds = [...new Set(rows.filter((r) => r.actorType === 'admin').map((r) => r.actorId))];
  const [accounts, admins] = await Promise.all([
    accountIds.length ? prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, fullName: true, email: true } }) : [],
    adminIds.length ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true, email: true } }) : [],
  ]);
  const nameOf = new Map([...accounts, ...admins].map((a) => [a.id, a.fullName ?? a.email ?? a.id]));
  return {
    data: rows.map((r) => ({ ...r, actorName: nameOf.get(r.actorId) ?? null })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

/** Super-admin creates a shopkeeper (account + shop + OWNER membership) directly. */
export async function createShopOwner(
  ctx: ReqCtx,
  input: {
    shopName: string;
    fullName: string;
    email?: string;
    phone: string;
    password: string;
    shopPhone?: string;
    shopAddress?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstNumber?: string;
    shopType?: 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR' | 'SERVICE' | 'MANUFACTURING' | 'ONLINE' | 'OTHER';
  },
) {
  const existing = await prisma.account.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])], deletedAt: null },
  });
  if (existing) throw new HttpError(409, 'ACCOUNT_EXISTS', 'An account with this phone or email already exists');

  const passwordHash = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: { fullName: input.fullName, email: input.email, phone: input.phone, passwordHash, status: 'ACTIVE' },
    });
    const shop = await tx.shop.create({
      data: {
        name: input.shopName,
        ownerAccountId: account.id,
        phone: input.shopPhone ?? input.phone,
        // Keep the shop's own contact email in sync with the owner email so it
        // reflects on the admin shop list/detail pages.
        email: input.email,
        address: input.shopAddress,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        gstNumber: input.gstNumber,
        shopType: input.shopType ?? 'RETAIL',
        status: 'ACTIVE',
      },
    });
    await tx.shopMembership.create({
      data: { shopId: shop.id, accountId: account.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    await tx.warehouse.create({
      data: { shopId: shop.id, name: 'Main Warehouse', code: 'MAIN', isDefault: true },
    });
    return { account, shop };
  });

  await writeAudit({
    ...ctx,
    action: 'SHOP_OWNER_CREATED',
    entityType: 'shop',
    entityId: result.shop.id,
    shopId: result.shop.id,
    newValue: { accountId: result.account.id, shopName: result.shop.name },
    severity: 'HIGH',
  });
  return {
    id: result.account.id,
    fullName: result.account.fullName,
    email: result.account.email,
    phone: result.account.phone,
    shop: { id: result.shop.id, name: result.shop.name },
  };
}

/* --------------------------------- users --------------------------------- */

export async function listUsers(ctx: ReqCtx, query: { page: number; limit: number; search?: string; status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'BLOCKED' }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.AccountWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { OR: [{ fullName: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.account.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: ACCOUNT_SELECT }),
    prisma.account.count({ where }),
  ]);
  void ctx;
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function getUser(id: string) {
  const user = await prisma.account.findFirst({
    where: { id, deletedAt: null },
    select: { ...ACCOUNT_SELECT, memberships: { where: { deletedAt: null }, include: { shop: { select: { id: true, name: true } } } } },
  });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  return user;
}

export async function updateUser(ctx: ReqCtx, id: string, input: { fullName?: string; phone?: string | null; email?: string }) {
  const before = await getUser(id);
  const data: Prisma.AccountUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phone !== undefined && input.phone !== null) data.phone = input.phone;
  if (input.email !== undefined && input.email !== before.email) {
    const dup = await prisma.account.findFirst({ where: { email: input.email, deletedAt: null, NOT: { id } } });
    if (dup) throw new HttpError(409, 'EMAIL_EXISTS', 'Email already in use');
    data.email = input.email;
    data.emailVerifiedAt = null;
  }
  const after = await prisma.account.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: 'USER_ADMIN_UPDATED', entityType: 'account', entityId: id, newValue: { fullName: input.fullName }, severity: 'HIGH' });
  return after;
}

export async function suspendUser(ctx: ReqCtx, id: string, input: { reason?: string }) {
  await getUser(id);
  const after = await prisma.account.update({ where: { id }, data: { status: 'SUSPENDED' } });
  await prisma.refreshToken.updateMany({ where: { actorType: 'account', actorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'USER_SUSPENDED', entityType: 'account', entityId: id, newValue: { status: 'SUSPENDED', reason: input.reason }, severity: 'HIGH' });
  return after;
}

export async function reactivateUser(ctx: ReqCtx, id: string) {
  await getUser(id);
  const after = await prisma.account.update({ where: { id }, data: { status: 'ACTIVE' } });
  await writeAudit({ ...ctx, action: 'USER_REACTIVATED', entityType: 'account', entityId: id, newValue: { status: 'ACTIVE' }, severity: 'HIGH' });
  return after;
}

/** Super Admin resets any account's password. */
export async function resetUserPassword(ctx: ReqCtx, id: string, input: { password: string }) {
  const user = await getUser(id);
  const passwordHash = await hashPassword(input.password);
  const after = await prisma.account.update({ where: { id }, data: { passwordHash } });
  await writeAudit({ ...ctx, action: 'USER_PASSWORD_RESET', entityType: 'account', entityId: id, newValue: { email: user.email }, severity: 'HIGH' });
  return { id: after.id, email: after.email, passwordReset: true };
}

/* ------------------------------- approvals ------------------------------- */

export async function listApprovals(ctx: ReqCtx, query: { page: number; limit: number; status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.UserProfileChangeWhereInput = { deletedAt: null, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.userProfileChange.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.userProfileChange.count({ where }),
  ]);
  void ctx;
  const requesterIds = [...new Set(rows.map((r) => r.requesterId))];
  const [accounts, admins] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: requesterIds } }, select: { id: true, fullName: true, email: true } }),
    prisma.admin.findMany({ where: { id: { in: requesterIds } }, select: { id: true, fullName: true, email: true } }),
  ]);
  const nameOf = new Map([...accounts, ...admins].map((a) => [a.id, a]));
  return {
    data: rows.map((r) => ({ ...r, requesterName: nameOf.get(r.requesterId)?.fullName ?? null, requesterEmail: nameOf.get(r.requesterId)?.email ?? null })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

export async function approveChange(ctx: ReqCtx, id: string) {
  const req = await prisma.userProfileChange.findFirst({ where: { id, deletedAt: null } });
  if (!req) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Change request not found');
  if (req.status !== 'PENDING') throw new HttpError(409, 'REQUEST_RESOLVED', 'Request has already been resolved');
  const changes = (req.changes ?? {}) as Record<string, unknown>;

  await prisma.$transaction(async (tx) => {
    if (req.entityType === 'shop' || (req.entityType === 'account' && changes.shopName)) {
      const shopId = req.entityType === 'shop' ? req.entityId ?? req.shopId : req.shopId;
      if (shopId) {
        const shopData: Prisma.ShopUpdateInput = {};
        if (typeof changes.name === 'string') shopData.name = changes.name;
        if (typeof changes.phone === 'string') shopData.phone = changes.phone;
        if (typeof changes.email === 'string') shopData.email = changes.email;
        if (typeof changes.address === 'string') shopData.address = changes.address;
        if (Object.keys(shopData).length > 0) await tx.shop.update({ where: { id: shopId }, data: shopData });
      }
    }
    if (req.entityType === 'account' || req.entityType === 'membership') {
      const accountId = req.entityType === 'account' ? req.entityId ?? req.requesterId : req.requesterId;
      const accountData: Prisma.AccountUpdateInput = {};
      if (typeof changes.fullName === 'string' || typeof changes.name === 'string') {
        accountData.fullName = (changes.fullName ?? changes.name) as string;
      }
      if (typeof changes.phone === 'string') accountData.phone = changes.phone;
      if (typeof changes.email === 'string') {
        const dup = await tx.account.findFirst({ where: { email: changes.email, deletedAt: null, NOT: { id: accountId } } });
        if (dup) throw new HttpError(409, 'EMAIL_EXISTS', 'Requested email is already in use');
        accountData.email = changes.email;
        accountData.emailVerifiedAt = null;
      }
      if (Object.keys(accountData).length > 0) await tx.account.update({ where: { id: accountId }, data: accountData });
    }
    await tx.userProfileChange.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewerAdminId: ctx.actor.adminId ?? null },
    });
  });
  await writeAudit({ ...ctx, action: 'PROFILE_CHANGE_APPROVED', entityType: 'user_profile_change', entityId: id, shopId: req.shopId, newValue: { changes }, severity: 'HIGH' });
  return { approved: true };
}

export async function rejectChange(ctx: ReqCtx, id: string, input: { reason?: string }) {
  const req = await prisma.userProfileChange.findFirst({ where: { id, deletedAt: null } });
  if (!req) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Change request not found');
  if (req.status !== 'PENDING') throw new HttpError(409, 'REQUEST_RESOLVED', 'Request has already been resolved');
  await prisma.userProfileChange.update({
    where: { id },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewerAdminId: ctx.actor.adminId ?? null, reviewNote: input.reason },
  });
  await writeAudit({ ...ctx, action: 'PROFILE_CHANGE_REJECTED', entityType: 'user_profile_change', entityId: id, shopId: req.shopId, severity: 'MEDIUM' });
  return { rejected: true };
}

/** Send an approval back to the requester for modification (re-opens as PENDING). */
export async function requestModification(ctx: ReqCtx, id: string, input: { comment?: string }) {
  const req = await prisma.userProfileChange.findFirst({ where: { id, deletedAt: null } });
  if (!req) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'Change request not found');
  if (req.status !== 'PENDING') throw new HttpError(409, 'REQUEST_RESOLVED', 'Request has already been resolved');
  await prisma.userProfileChange.update({
    where: { id },
    data: { status: 'PENDING', reviewedAt: new Date(), reviewerAdminId: ctx.actor.adminId ?? null, reviewNote: input.comment ?? 'Modification requested' },
  });
  await writeAudit({ ...ctx, action: 'PROFILE_CHANGE_MODIFICATION_REQUESTED', entityType: 'user_profile_change', entityId: id, shopId: req.shopId, severity: 'MEDIUM', newValue: { comment: input.comment } });
  return { modificationRequested: true };
}

/* -------------------------------- tickets -------------------------------- */

async function hydrateTickets<T extends { accountId: string | null; shopId: string | null; assignedToAdminId?: string | null }>(rows: T[]) {
  const accountIds = [...new Set(rows.map((r) => r.accountId).filter(Boolean) as string[])];
  const shopIds = [...new Set(rows.map((r) => r.shopId).filter(Boolean) as string[])];
  const adminIds = [...new Set(rows.map((r) => r.assignedToAdminId).filter(Boolean) as string[])];
  const [accounts, shops, admins] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, fullName: true, email: true } }),
    prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }),
    prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true } }),
  ]);
  const aMap = new Map(accounts.map((a) => [a.id, a]));
  const sMap = new Map(shops.map((s) => [s.id, s]));
  const adMap = new Map(admins.map((a) => [a.id, a]));
  return rows.map((r) => ({
    ...r,
    account: r.accountId ? aMap.get(r.accountId) ?? null : null,
    shop: r.shopId ? sMap.get(r.shopId) ?? null : null,
    assignee: r.assignedToAdminId ? adMap.get(r.assignedToAdminId) ?? null : null,
  }));
}

export async function createTicket(ctx: ReqCtx, input: { subject: string; description: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; category?: string; shopId?: string }) {
  // Shop users can only open tickets against their own active shop; only
  // platform admins may file tickets on behalf of an arbitrary shop.
  const shopId =
    ctx.actor.actorType === 'account'
      ? ctx.actor.activeShopId ?? null
      : input.shopId ?? ctx.actor.activeShopId ?? null;
  if (ctx.actor.actorType === 'account' && !shopId) {
    throw new HttpError(400, 'NO_ACTIVE_SHOP', 'Select an active shop to open a support ticket');
  }
  const ticket = await prisma.supportTicket.create({
    data: {
      shopId,
      accountId: ctx.actor.actorType === 'account' ? ctx.actor.accountId! : null,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      category: input.category,
      status: 'OPEN',
    },
  });
  await writeAudit({ ...ctx, action: 'TICKET_CREATED', entityType: 'support_ticket', entityId: ticket.id, shopId, newValue: { subject: input.subject } });
  return ticket;
}

export async function listTickets(query: { page: number; limit: number; status?: string; priority?: string; search?: string }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.SupportTicketWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.search ? { OR: [{ subject: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.supportTicket.count({ where }),
  ]);
  return { data: await hydrateTickets(rows), meta: pageMeta(total, query.page, query.limit) };
}

export async function getTicket(ctx: ReqCtx, id: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, deletedAt: null } });
  if (!ticket) throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  // Shop users may only view their own active shop's tickets; admins see all.
  if (ctx.actor.actorType === 'account' && ticket.shopId !== ctx.actor.activeShopId) {
    throw new HttpError(403, 'TICKET_FORBIDDEN', 'You cannot view this ticket');
  }
  const isAdmin = ctx.actor.actorType === 'admin';
  const replies = await prisma.ticketReply.findMany({
    // internal staff notes are never exposed to shop users
    where: { ticketId: id, deletedAt: null, ...(isAdmin ? {} : { isInternal: false }) },
    orderBy: { createdAt: 'asc' },
  });
  const [hydrated] = await hydrateTickets([ticket]);
  const authorIds = [...new Set(replies.map((r) => r.authorId))];
  const [accounts, admins] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } }),
    prisma.admin.findMany({ where: { id: { in: authorIds } }, select: { id: true, fullName: true } }),
  ]);
  const nameOf = new Map([...accounts, ...admins].map((a) => [a.id, a.fullName]));
  return { ...hydrated, replies: replies.map((r) => ({ ...r, authorName: nameOf.get(r.authorId) ?? null })) };
}

export async function updateTicket(ctx: ReqCtx, id: string, input: { subject?: string; description?: string; category?: string; status?: string; priority?: string; assignedToAdminId?: string | null }) {
  const before = await prisma.supportTicket.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  if (input.assignedToAdminId) {
    const assignee = await prisma.admin.findFirst({ where: { id: input.assignedToAdminId, deletedAt: null } });
    if (!assignee) throw new HttpError(404, 'ASSIGNEE_NOT_FOUND', 'Assignee must be a platform admin');
  }
  const data: Prisma.SupportTicketUpdateInput = {};
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === 'RESOLVED') data.resolvedAt = new Date();
    if (input.status === 'CLOSED') data.closedAt = new Date();
  }
  if (input.assignedToAdminId !== undefined) data.assignedToAdminId = input.assignedToAdminId;
  const after = await prisma.supportTicket.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: 'TICKET_UPDATED', entityType: 'support_ticket', entityId: id, shopId: before.shopId, oldValue: { status: before.status }, newValue: { status: after.status } });
  return after;
}

export async function replyTicket(ctx: ReqCtx, id: string, input: { message: string; isInternal: boolean }) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, deletedAt: null } });
  if (!ticket) throw new HttpError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  if (ctx.actor.actorType === 'account' && ticket.shopId !== ctx.actor.activeShopId) {
    throw new HttpError(403, 'TICKET_FORBIDDEN', 'You cannot reply to this ticket');
  }
  const authorId = ctx.actor.actorType === 'admin' ? ctx.actor.adminId! : ctx.actor.accountId!;
  // only platform admins may write internal staff notes
  const isInternal = ctx.actor.actorType === 'admin' ? (input.isInternal ?? false) : false;
  const reply = await prisma.ticketReply.create({
    data: { ticketId: id, authorId, message: input.message, isInternal },
  });
  if (ticket.status === 'OPEN') {
    await prisma.supportTicket.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  }
  await writeAudit({ ...ctx, action: 'TICKET_REPLIED', entityType: 'ticket_reply', entityId: reply.id, shopId: ticket.shopId });
  return reply;
}

/* --------------------------------- plans --------------------------------- */

export async function createPlan(
  ctx: ReqCtx,
  input: { code: PlanCode; name: string; description?: string; monthlyPrice: string; yearlyPrice: string; currency: string; trialDays: number; features: string[]; limits: Record<string, number>; isActive: boolean; sortOrder: number },
) {
  const dup = await prisma.subscriptionPlan.findFirst({ where: { code: input.code, deletedAt: null } });
  if (dup) throw new HttpError(409, 'PLAN_EXISTS', 'A plan with this code already exists');
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description,
      monthlyPrice: new Prisma.Decimal(input.monthlyPrice),
      yearlyPrice: new Prisma.Decimal(input.yearlyPrice),
      currency: input.currency ?? 'INR',
      trialDays: input.trialDays ?? 0,
      features: input.features ?? [],
      limits: (input.limits ?? {}) as Prisma.InputJsonValue,
      isActive: input.isActive !== false,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAudit({ ...ctx, action: 'PLAN_CREATED', entityType: 'subscription_plan', entityId: plan.id, newValue: { code: plan.code }, severity: 'HIGH' });
  return plan;
}

export async function updatePlan(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
  const before = await prisma.subscriptionPlan.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Plan not found');
  const data: Prisma.SubscriptionPlanUpdateInput = {};
  if (input.name !== undefined) data.name = input.name as string;
  if (input.description !== undefined) data.description = (input.description as string) || null;
  if (input.monthlyPrice !== undefined) data.monthlyPrice = new Prisma.Decimal(input.monthlyPrice as string);
  if (input.yearlyPrice !== undefined) data.yearlyPrice = new Prisma.Decimal(input.yearlyPrice as string);
  if (input.currency !== undefined) data.currency = input.currency as string;
  if (input.trialDays !== undefined) data.trialDays = input.trialDays as number;
  if (input.features !== undefined) data.features = input.features as Prisma.InputJsonValue;
  if (input.limits !== undefined) data.limits = input.limits as Prisma.InputJsonValue;
  if (input.isActive !== undefined) data.isActive = input.isActive as boolean;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder as number;
  const after = await prisma.subscriptionPlan.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: 'PLAN_UPDATED', entityType: 'subscription_plan', entityId: id, oldValue: { name: before.name }, newValue: { name: after.name }, severity: 'HIGH' });
  return after;
}

export async function listSubscriptionsAdmin(query: { page: number; limit: number; status?: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED' }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.SubscriptionWhereInput = { deletedAt: null, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    prisma.subscription.count({ where }),
  ]);
  const shopIds = [...new Set(rows.map((r) => r.shopId))];
  const shops = await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } });
  const nameOf = new Map(shops.map((s) => [s.id, s.name]));
  return { data: rows.map((r) => ({ ...r, shopName: nameOf.get(r.shopId) ?? null })), meta: pageMeta(total, query.page, query.limit) };
}

/* ------------------------------- referrals ------------------------------- */

/** Platform-wide referral stats for the admin referrals page. */
export async function referralStats() {
  const [totalReferrals, converted, pending, rewardAgg, codes] = await Promise.all([
    prisma.referral.count({ where: { deletedAt: null } }),
    prisma.referral.count({ where: { deletedAt: null, status: { in: ['CONVERTED', 'REWARDED'] } } }),
    prisma.referral.count({ where: { deletedAt: null, status: 'PENDING' } }),
    prisma.referral.aggregate({ where: { deletedAt: null }, _sum: { rewardAmount: true } }),
    prisma.referralCode.count({ where: { status: 'ACTIVE' } }),
  ]);
  return {
    totalReferrals,
    converted,
    pending,
    totalRewards: (rewardAgg._sum.rewardAmount ?? new Prisma.Decimal(0)).toString(),
    activeCodes: codes,
  };
}

export async function listReferralCodes(ctx: ReqCtx, query: { page: number; limit: number }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const [rows, total] = await Promise.all([
    prisma.referralCode.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.referralCode.count(),
  ]);
  void ctx;
  const shopIds = [...new Set(rows.map((r) => r.shopId).filter(Boolean) as string[])];
  const shops = shopIds.length ? await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(shops.map((s) => [s.id, s.name]));
  return {
    data: rows.map((c) => ({ ...c, shopName: c.shopId ? (nameOf.get(c.shopId) ?? null) : null, uses: c.usedCount })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

export async function listReferralsAdmin(ctx: ReqCtx, query: { page: number; limit: number; status?: 'PENDING' | 'CONVERTED' | 'REWARDED' }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.ReferralWhereInput = { deletedAt: null, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.referral.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { code: { select: { code: true } } } }),
    prisma.referral.count({ where }),
  ]);
  void ctx;
  const shopIds = [...new Set(rows.flatMap((r) => [r.referrerShopId, r.referredShopId]).filter(Boolean) as string[])];
  const shops = shopIds.length ? await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(shops.map((s) => [s.id, s.name]));
  return {
    data: rows.map((r) => ({
      ...r,
      code: r.code.code,
      referrerShopName: r.referrerShopId ? (nameOf.get(r.referrerShopId) ?? null) : null,
      referredShopName: r.referredShopId ? (nameOf.get(r.referredShopId) ?? null) : null,
    })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

/* -------------------------------- reports -------------------------------- */

export async function revenueReport(query: { fromDate?: string; toDate?: string }) {
  const now = new Date();
  const from = query.fromDate ? parseDate(query.fromDate)! : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.toDate ? parseDate(query.toDate)! : now;
  const subscriptions = await prisma.subscription.findMany({
    where: { deletedAt: null, status: 'ACTIVE', createdAt: { gte: from, lte: to } },
    include: { plan: true },
  });
  const byPlan = new Map<string, { count: number; mrr: Prisma.Decimal }>();
  for (const s of subscriptions) {
    const b = byPlan.get(s.plan.code) ?? { count: 0, mrr: new Prisma.Decimal(0) };
    b.count += 1;
    b.mrr = b.mrr.add(s.billingCycle === 'YEARLY' ? s.plan.yearlyPrice.div(12) : s.plan.monthlyPrice);
    byPlan.set(s.plan.code, b);
  }
  const mrr = [...byPlan.values()].reduce((a, b) => a.add(b.mrr), new Prisma.Decimal(0));
  return {
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    mrr: mrr.toFixed(2),
    newSubscriptions: subscriptions.length,
    byPlan: [...byPlan.entries()].map(([planCode, b]) => ({ planCode, count: b.count, mrr: b.mrr.toFixed(2) })),
  };
}

/* -------------------------------- settings ------------------------------- */

export async function getSettings() {
  const rows = await prisma.platformSetting.findMany({ where: { deletedAt: null } });
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

export async function updateSettings(ctx: ReqCtx, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (keys.length === 0) throw new HttpError(400, 'NO_SETTINGS', 'No settings provided');
  await prisma.$transaction(
    keys.map((key) =>
      prisma.platformSetting.upsert({
        where: { key },
        update: { value: input[key] as Prisma.InputJsonValue, updatedByAdminId: ctx.actor.adminId ?? null },
        create: { key, value: input[key] as Prisma.InputJsonValue, updatedByAdminId: ctx.actor.adminId ?? null },
      }),
    ),
  );
  await writeAudit({ ...ctx, action: 'PLATFORM_SETTINGS_UPDATED', entityType: 'platform_setting', entityId: keys.join(','), newValue: input, severity: 'HIGH' });
  return getSettings();
}

/* ------------------------------ login history ----------------------------- */

export async function loginHistory(query: { page: number; limit: number; accountId?: string; fromDate?: string; toDate?: string }) {
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.AuditLogWhereInput = {
    action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT'] },
    deletedAt: null,
    ...(query.accountId ? { actorId: query.accountId } : {}),
    ...(query.fromDate || query.toDate ? { createdAt: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const [accounts, admins] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, email: true } }),
    prisma.admin.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, email: true } }),
  ]);
  const whoOf = new Map([...accounts, ...admins].map((a) => [a.id, a]));
  return {
    data: rows.map((r) => ({ ...r, actor: whoOf.get(r.actorId) ?? null })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

/* -------------------------------- devices -------------------------------- */

export async function listAllDevices(query: { page: number; limit: number; search?: string }) {
  const { skip, take } = getPagination(query.page, query.limit);
  let accountIds: string[] | undefined;
  if (query.search) {
    const matched = await prisma.account.findMany({
      where: { deletedAt: null, OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { fullName: { contains: query.search, mode: 'insensitive' } }] },
      select: { id: true },
      take: 100,
    });
    accountIds = matched.map((m) => m.id);
  }
  const where: Prisma.DeviceWhereInput = {
    deletedAt: null,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { fingerprint: { contains: query.search } }, ...(accountIds && accountIds.length > 0 ? [{ actorType: 'account' as const, actorId: { in: accountIds } }] : [])] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.device.findMany({ where, skip, take, orderBy: { lastSeenAt: 'desc' } }),
    prisma.device.count({ where }),
  ]);
  const ids = [...new Set(rows.map((r) => r.actorId))];
  const [accounts, admins] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } }),
    prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } }),
  ]);
  const whoOf = new Map([...accounts, ...admins].map((a) => [a.id, a]));
  return {
    data: rows.map((r) => ({ ...r, owner: whoOf.get(r.actorId) ?? null, revoked: r.revokedAt != null })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

export async function revokeDevice(ctx: ReqCtx, id: string) {
  const device = await prisma.device.findFirst({ where: { id, deletedAt: null } });
  if (!device) throw new HttpError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  await prisma.device.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.refreshToken.updateMany({ where: { actorType: device.actorType, actorId: device.actorId, deviceId: device.deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'DEVICE_REVOKED_ADMIN', entityType: 'device', entityId: id, newValue: { revoked: true }, severity: 'HIGH' });
  return { revoked: true };
}
