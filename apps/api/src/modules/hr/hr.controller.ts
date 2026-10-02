import type { Request, Response, NextFunction } from 'express';
import { ctxFromReq, requireShopId } from '../ctx';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import * as s from './hr.service';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

/**
 * Staff without marking/managing rights see only their own records.
 * Managers/owners/accountants see the whole shop.
 */
async function scopeFor(ctx: ReturnType<typeof ctxFromReq>, shopId: string): Promise<string | undefined> {
  const perms = ctx.actor.permissions ?? [];
  if (perms.includes('ATTENDANCE_MARK') || perms.includes('SALARY_MANAGE')) return undefined;
  if (!ctx.actor.accountId) return undefined;
  const m = await prisma.shopMembership.findFirst({
    where: { shopId, accountId: ctx.actor.accountId, deletedAt: null },
    select: { id: true },
  });
  return m?.id;
}

export async function getAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    ok(res, await s.getAttendance(shopId, req.query as never, await scopeFor(ctx, shopId)));
  } catch (e) { next(e); }
}

export async function postAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const result = await s.markAttendance(shopId, req.body, ctx.actor.accountId);
    await writeAudit({
      actor: ctx.actor, action: 'ATTENDANCE_MARKED', entityType: 'attendance',
      shopId, newValue: { date: req.body.date, count: req.body.records?.length ?? 0 },
    });
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getStructures(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    ok(res, await s.getSalaryStructures(requireShopId(ctx)));
  } catch (e) { next(e); }
}

export async function putStructure(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const result = await s.setSalaryStructure(shopId, req.params.membershipId, req.body, ctx.actor.accountId);
    await writeAudit({
      actor: ctx.actor, action: 'SALARY_STRUCTURE_SET', entityType: 'salary_structure',
      entityId: req.params.membershipId, shopId, newValue: { monthlySalary: req.body.monthlySalary },
    });
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getAdvances(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    ok(res, await s.listAdvances(requireShopId(ctx), req.query as never));
  } catch (e) { next(e); }
}

export async function postAdvance(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const result = await s.recordAdvance(shopId, req.body, ctx.actor.accountId);
    await writeAudit({
      actor: ctx.actor, action: 'SALARY_ADVANCE_GIVEN', entityType: 'salary_advance',
      entityId: (result as { id?: string })?.id, shopId,
      newValue: { membershipId: req.body.membershipId, amount: req.body.amount },
    });
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getSalary(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const now = new Date();
    const year = Number((req.query as { year?: string }).year ?? now.getUTCFullYear());
    const month = Number((req.query as { month?: string }).month ?? now.getUTCMonth() + 1);
    ok(res, await s.getSalarySlips(shopId, year, month, await scopeFor(ctx, shopId)));
  } catch (e) { next(e); }
}

export async function postPay(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const result = await s.paySalary(shopId, req.body, ctx.actor.accountId);
    await writeAudit({
      actor: ctx.actor, action: 'SALARY_PAID', entityType: 'salary_payment',
      entityId: (result as { id?: string })?.id, shopId,
      newValue: {
        membershipId: req.body.membershipId, year: req.body.year, month: req.body.month,
        netPayable: (result as { netPayable?: string })?.netPayable,
        carriedForward: (result as { carriedForward?: string })?.carriedForward,
      },
    });
    ok(res, result);
  } catch (e) { next(e); }
}

export async function getPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const q = req.query as { year?: string; month?: string };
    ok(res, await s.listPayments(
      shopId,
      q.year ? Number(q.year) : undefined,
      q.month ? Number(q.month) : undefined,
      await scopeFor(ctx, shopId),
    ));
  } catch (e) { next(e); }
}

export async function getLoginSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const ctx = ctxFromReq(req);
    const shopId = requireShopId(ctx);
    const q = req.query as { year?: string; month?: string };
    const year = q.year ? Number(q.year) : new Date().getUTCFullYear();
    const month = q.month ? Number(q.month) : new Date().getUTCMonth() + 1;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const sessions = await prisma.loginSession.findMany({
      where: { shopId, loginAt: { gte: start, lt: end } },
      orderBy: { loginAt: 'desc' },
      take: 200,
    });
    ok(res, sessions);
  } catch (e) { next(e); }
}
