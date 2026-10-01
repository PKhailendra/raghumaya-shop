import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { getPagination, pageMeta, parseDate } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';

function newReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function getMyCode(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  let code = await prisma.referralCode.findFirst({ where: { shopId, status: 'ACTIVE', deletedAt: null } });
  if (!code) {
    code = await prisma.referralCode.create({
      data: {
        shopId,
        code: newReferralCode(),
        createdByType: 'account',
        createdById: ctx.actor.accountId!,
        status: 'ACTIVE',
      },
    });
    await writeAudit({ ...ctx, action: 'REFERRAL_CODE_CREATED', entityType: 'referral_code', entityId: code.id, shopId, newValue: { code: code.code } });
  }
  return code;
}

export async function regenerateCode(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  await prisma.referralCode.updateMany({ where: { shopId, status: 'ACTIVE', deletedAt: null }, data: { status: 'INACTIVE' } });
  const code = await prisma.referralCode.create({
    data: {
      shopId,
      code: newReferralCode(),
      createdByType: 'account',
      createdById: ctx.actor.accountId!,
      status: 'ACTIVE',
    },
  });
  await writeAudit({ ...ctx, action: 'REFERRAL_CODE_REGENERATED', entityType: 'referral_code', entityId: code.id, shopId, severity: 'MEDIUM' });
  return code;
}

export async function validateCode(code: string) {
  const ref = await prisma.referralCode.findFirst({ where: { code: code.toUpperCase(), status: 'ACTIVE', deletedAt: null } });
  if (!ref) throw new HttpError(404, 'REFERRAL_CODE_INVALID', 'Referral code is invalid or inactive');
  if (ref.expiresAt && ref.expiresAt < new Date()) throw new HttpError(410, 'REFERRAL_CODE_EXPIRED', 'Referral code has expired');
  if (ref.maxUses != null && ref.usedCount >= ref.maxUses) throw new HttpError(409, 'REFERRAL_CODE_LIMIT', 'Referral code usage limit reached');
  let shopName: string | null = null;
  if (ref.shopId) {
    const shop = await prisma.shop.findUnique({ where: { id: ref.shopId }, select: { name: true } });
    shopName = shop?.name ?? null;
  }
  return { valid: true, code: ref.code, shopName, rewardAmount: ref.rewardAmount.toString() };
}

/** Record a referral when a new shop registers with a code (called from registration). */
export async function trackReferralConversion(input: { code: string; referredShopId?: string; referredAccountId?: string }) {
  const ref = await prisma.referralCode.findFirst({ where: { code: input.code.toUpperCase(), status: 'ACTIVE', deletedAt: null } });
  if (!ref) return null;
  const referral = await prisma.referral.create({
    data: {
      codeId: ref.id,
      referrerShopId: ref.shopId,
      referredShopId: input.referredShopId,
      referredAccountId: input.referredAccountId,
      status: 'CONVERTED',
      rewardAmount: ref.rewardAmount,
      convertedAt: new Date(),
    },
  });
  await prisma.referralCode.update({ where: { id: ref.id }, data: { usedCount: { increment: 1 } } });
  return referral;
}

export async function trackReferral(ctx: ReqCtx, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.ReferralWhereInput = { code: { shopId }, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.referral.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { code: { select: { code: true } } } }),
    prisma.referral.count({ where }),
  ]);
  const shopIds = [...new Set(rows.flatMap((r) => [r.referrerShopId, r.referredShopId]).filter(Boolean) as string[])];
  const shops = await prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } });
  const nameOf = new Map(shops.map((s) => [s.id, s.name]));
  return {
    data: rows.map((r) => ({
      ...r,
      referrerShopName: r.referrerShopId ? nameOf.get(r.referrerShopId) ?? null : null,
      referredShopName: r.referredShopId ? nameOf.get(r.referredShopId) ?? null : null,
    })),
    meta: pageMeta(total, query.page, query.limit),
  };
}

export async function referralDashboard(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  const codeWhere = { shopId, deletedAt: null };
  const [codes, total, converted, pending, rewarded] = await Promise.all([
    prisma.referralCode.findMany({ where: codeWhere, select: { id: true, code: true, status: true, usedCount: true, maxUses: true, rewardAmount: true, expiresAt: true, createdAt: true } }),
    prisma.referral.count({ where: { code: { shopId }, deletedAt: null } }),
    prisma.referral.count({ where: { code: { shopId }, status: 'CONVERTED', deletedAt: null } }),
    prisma.referral.count({ where: { code: { shopId }, status: 'PENDING', deletedAt: null } }),
    prisma.referral.aggregate({ where: { code: { shopId }, rewardStatus: 'EARNED', deletedAt: null }, _sum: { rewardAmount: true }, _count: { _all: true } }),
  ]);
  return {
    codes,
    stats: {
      totalReferrals: total,
      converted,
      pending,
      rewardsEarned: rewarded._count._all,
      totalRewardValue: (rewarded._sum.rewardAmount ?? new Prisma.Decimal(0)).toString(),
    },
  };
}

export async function listReferrals(ctx: ReqCtx, query: { page: number; limit: number; status?: 'PENDING' | 'CONVERTED' | 'REWARDED' }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.ReferralWhereInput = {
    code: { shopId },
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.referral.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { code: { select: { code: true } } } }),
    prisma.referral.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

/** Mark a referral's reward as earned (called after conversion criteria are met). */
export async function markRewardEarned(referralId: string) {
  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!referral || referral.rewardStatus !== 'PENDING') return null;
  return prisma.referral.update({ where: { id: referralId }, data: { rewardStatus: 'EARNED' } });
}

/* -------------------------------- coupons -------------------------------- */

export async function createCoupon(
  ctx: ReqCtx,
  input: { code?: string; discountType: 'PERCENT' | 'FLAT'; discountValue: string; validFrom?: string; validTo?: string; usageLimit?: number; description?: string },
) {
  const shopId = requireShopId(ctx);
  const code = (input.code ?? newReferralCode()).toUpperCase();
  const dup = await prisma.coupon.findFirst({ where: { code, deletedAt: null } });
  if (dup) throw new HttpError(409, 'COUPON_EXISTS', 'Coupon code already exists');
  const coupon = await prisma.coupon.create({
    data: {
      shopId,
      code,
      discountType: input.discountType,
      discountValue: new Prisma.Decimal(input.discountValue),
      validFrom: input.validFrom ? parseDate(input.validFrom)! : null,
      validTo: input.validTo ? parseDate(input.validTo)! : null,
      usageLimit: input.usageLimit,
      description: input.description,
      status: 'ACTIVE',
    },
  });
  await writeAudit({ ...ctx, action: 'COUPON_CREATED', entityType: 'coupon', entityId: coupon.id, shopId, newValue: coupon });
  return coupon;
}

export async function listCoupons(ctx: ReqCtx, query: { page: number; limit: number }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where = { shopId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.coupon.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function validateCoupon(ctx: ReqCtx, code: string) {
  const shopId = requireShopId(ctx);
  const coupon = await prisma.coupon.findFirst({ where: { code: code.toUpperCase(), deletedAt: null, OR: [{ shopId }, { shopId: null }] } });
  if (!coupon) throw new HttpError(404, 'COUPON_NOT_FOUND', 'Coupon not found');
  const now = new Date();
  if (coupon.status !== 'ACTIVE') throw new HttpError(410, 'COUPON_INACTIVE', 'Coupon is no longer active');
  if (coupon.validFrom && now < coupon.validFrom) throw new HttpError(409, 'COUPON_NOT_STARTED', 'Coupon is not yet valid');
  if (coupon.validTo && now > coupon.validTo) throw new HttpError(410, 'COUPON_EXPIRED', 'Coupon has expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new HttpError(409, 'COUPON_LIMIT_REACHED', 'Coupon usage limit reached');
  return { valid: true, coupon };
}
