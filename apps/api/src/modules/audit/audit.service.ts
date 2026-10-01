import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getPagination, pageMeta, parseDate } from '../../lib/utils';
import type { ReqCtx } from '../ctx';
import { optionalShopId } from '../ctx';

const SEVERITY_DEFAULTS: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
  CUSTOMER_DELETED: 'HIGH',
  INVOICE_DELETED: 'HIGH',
  MEMBER_REMOVED: 'HIGH',
  SHOP_USER_DELETED: 'HIGH',
  SUBSCRIPTION_ADMIN_ASSIGNED: 'HIGH',
  SHOP_CREATED: 'MEDIUM',
  INVOICE_CREATED: 'MEDIUM',
  PAYMENT_RECORDED: 'MEDIUM',
  PASSWORD_CHANGED: 'MEDIUM',
  LOGIN_FAILED: 'MEDIUM',
  REFERRAL_CODE_REGENERATED: 'MEDIUM',
};

export function severityFor(action: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return SEVERITY_DEFAULTS[action] ?? 'LOW';
}

export async function listAuditLogs(
  ctx: ReqCtx,
  query: {
    page: number;
    limit: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    fromDate?: string;
    toDate?: string;
  },
) {
  const shopId = optionalShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.AuditLogWhereInput = {
    ...(shopId ? { shopId } : {}),
    deletedAt: null,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.fromDate || query.toDate ? { createdAt: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function auditDashboard(ctx: ReqCtx, query: { fromDate?: string; toDate?: string }) {
  const shopId = optionalShopId(ctx);
  const now = new Date();
  const from = query.fromDate ? parseDate(query.fromDate)! : new Date(now.getTime() - 30 * 86400000);
  const to = query.toDate ? parseDate(query.toDate)! : now;
  const where: Prisma.AuditLogWhereInput = { ...(shopId ? { shopId } : {}), deletedAt: null, createdAt: { gte: from, lte: to } };
  const [byAction, bySeverity, byActor, total] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 15 }),
    prisma.auditLog.groupBy({ by: ['severity'], where, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['actorId'], where, _count: { _all: true }, orderBy: { _count: { actorId: 'desc' } }, take: 10 }),
    prisma.auditLog.count({ where }),
  ]);
  const actors = await prisma.account.findMany({ where: { id: { in: byActor.map((b) => b.actorId) } }, select: { id: true, fullName: true, email: true } });
  const actorName = new Map(actors.map((a) => [a.id, a]));
  return {
    total,
    range: { fromDate: from.toISOString(), toDate: to.toISOString() },
    byAction: byAction.map((b) => ({ action: b.action, count: b._count._all })),
    bySeverity: bySeverity.map((b) => ({ severity: b.severity, count: b._count._all })),
    topActors: byActor.map((b) => ({ actorId: b.actorId, name: actorName.get(b.actorId)?.fullName ?? 'System', email: actorName.get(b.actorId)?.email ?? null, count: b._count._all })),
  };
}
