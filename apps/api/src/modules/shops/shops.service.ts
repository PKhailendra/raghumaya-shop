import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../../lib/audit';
import { signAccessToken } from '../../lib/crypto';
import { getPagination, pageMeta } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import type { ShopPermission, UserRole } from '@raghumaya/shared';
import { DEFAULT_ROLE_PERMISSIONS, SHOP_PERMISSIONS } from '@raghumaya/shared';

export async function createShop(ctx: ReqCtx, input: Record<string, unknown>) {
  const accountId = ctx.actor.accountId!;
  const shop = await prisma.$transaction(async (tx) => {
    const created = await tx.shop.create({
      data: { ...(input as unknown as Prisma.ShopUncheckedCreateInput), ownerAccountId: accountId, status: 'ACTIVE' },
    });
    await tx.shopMembership.create({
      data: { shopId: created.id, accountId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    await tx.warehouse.create({ data: { shopId: created.id, name: 'Main Warehouse', code: 'MAIN', isDefault: true } });
    return created;
  });
  await writeAudit({ ...ctx, action: 'SHOP_CREATED', entityType: 'shop', entityId: shop.id, shopId: shop.id, metadata: { name: shop.name } });
  return shop;
}

export async function myShops(ctx: ReqCtx) {
  const accountId = ctx.actor.accountId!;
  const memberships = await prisma.shopMembership.findMany({
    where: { accountId, status: 'ACTIVE', deletedAt: null },
    include: { shop: true },
    orderBy: { joinedAt: 'desc' },
  });
  return memberships.map((m) => ({ ...m.shop, role: m.role, membershipId: m.id }));
}

export async function getShop(ctx: ReqCtx, id: string) {
  const shop = await prisma.shop.findFirst({ where: { id, deletedAt: null } });
  if (!shop) throw new HttpError(404, 'SHOP_NOT_FOUND', 'Shop not found');
  if (ctx.actor.actorType === 'account') {
    const membership = await prisma.shopMembership.findFirst({
      where: { shopId: id, accountId: ctx.actor.accountId!, status: 'ACTIVE', deletedAt: null },
    });
    if (!membership) throw new HttpError(403, 'SHOP_ACCESS_DENIED', 'No access to this shop');
  }
  return shop;
}

export async function updateShop(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
  const before = await getShop(ctx, id);
  const after = await prisma.shop.update({ where: { id }, data: { ...(input as unknown as Prisma.ShopUncheckedUpdateInput) } });
  await writeAudit({ ...ctx, action: 'SHOP_UPDATED', entityType: 'shop', entityId: id, shopId: id, oldValue: before, newValue: after });
  return after;
}

export async function switchShop(ctx: ReqCtx, shopId: string) {
  const accountId = ctx.actor.accountId!;
  const membership = await prisma.shopMembership.findFirst({
    where: { shopId, accountId, status: 'ACTIVE', deletedAt: null },
    include: { shop: true },
  });
  if (!membership) throw new HttpError(403, 'SHOP_ACCESS_DENIED', 'You are not an active member of this shop');
  if (membership.shop.status !== 'ACTIVE' || membership.shop.deletedAt) {
    throw new HttpError(403, 'SHOP_BLOCKED', `Shop is ${membership.shop.status}`);
  }
  await prisma.shopMembership.update({ where: { id: membership.id }, data: { lastAccessedAt: new Date() } });
  const accessToken = signAccessToken({ actorType: 'account', accountId, activeShopId: shopId });
  await writeAudit({ ...ctx, action: 'SHOP_SWITCHED', entityType: 'shop', entityId: shopId, shopId, category: 'AUTH' });
  return { accessToken, tokenType: 'Bearer' as const, activeShopId: shopId, shop: membership.shop };
}

export async function listMembers(ctx: ReqCtx, shopId: string, page = 1, limit = 20) {
  await getShop(ctx, shopId);
  const { skip, take } = getPagination(page, limit);
  const where = { shopId, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.shopMembership.findMany({
      where,
      skip,
      take,
      orderBy: { joinedAt: 'desc' },
      include: { account: { select: { id: true, fullName: true, email: true, phone: true, status: true } } },
    }),
    prisma.shopMembership.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, page, limit) };
}

export async function inviteMember(
  ctx: ReqCtx,
  shopId: string,
  input: { fullName: string; email?: string; phone: string; role: UserRole; permissions?: ShopPermission[] },
) {
  await getShop(ctx, shopId);
  if (input.role === 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Cannot invite another OWNER');
  const existing = await prisma.account.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])], deletedAt: null },
  });
  const result = await prisma.$transaction(async (tx) => {
    const account =
      existing ??
      (await tx.account.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          // invited accounts set their password via forgot-password flow
          passwordHash: '!',
          status: 'ACTIVE',
        },
      }));
    const dup = await tx.shopMembership.findFirst({ where: { shopId, accountId: account.id, deletedAt: null } });
    if (dup) throw new HttpError(409, 'MEMBER_EXISTS', 'This user is already a member of the shop');
    const membership = await tx.shopMembership.create({
      data: {
        shopId,
        accountId: account.id,
        role: input.role,
        status: 'ACTIVE',
        permissions: (input.permissions ?? (input.role === 'OWNER' ? [] : DEFAULT_ROLE_PERMISSIONS[input.role]) ?? []) as never,
        invitedById: ctx.actor.accountId,
        joinedAt: new Date(),
      },
    });
    return { account, membership };
  });
  await writeAudit({ ...ctx, action: 'MEMBER_INVITED', entityType: 'shop_membership', entityId: result.membership.id, shopId, metadata: { role: input.role } });
  return { membershipId: result.membership.id, accountId: result.account.id, role: result.membership.role };
}

export async function updateMember(
  ctx: ReqCtx,
  shopId: string,
  memberId: string,
  input: { role?: UserRole; permissions?: ShopPermission[]; status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'BLOCKED' },
) {
  await getShop(ctx, shopId);
  const before = await prisma.shopMembership.findFirst({ where: { id: memberId, shopId, deletedAt: null }, include: { account: true } });
  if (!before) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
  if (before.role === 'OWNER' && (input.role !== 'OWNER' || input.status !== undefined)) {
    const owners = await prisma.shopMembership.count({ where: { shopId, role: 'OWNER', status: 'ACTIVE', deletedAt: null } });
    if (owners <= 1) throw new HttpError(403, 'FORBIDDEN', 'Cannot demote or suspend the last owner');
  }
  const roleChanged = input.role && input.role !== before.role;
  const after = await prisma.shopMembership.update({
    where: { id: memberId },
    data: {
      ...(input.role ? { role: input.role } : {}),
      // role change without explicit permissions → reset to the new role's defaults
      ...(input.permissions
        ? { permissions: input.permissions as never }
        : roleChanged
          ? { permissions: (input.role === 'OWNER' ? [...SHOP_PERMISSIONS] : (DEFAULT_ROLE_PERMISSIONS[input.role as Exclude<UserRole, 'OWNER'>] ?? [])) as never }
          : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
  await writeAudit({ ...ctx, action: 'MEMBER_UPDATED', entityType: 'shop_membership', entityId: memberId, shopId, severity: input.role || input.status ? 'MEDIUM' : 'INFO', oldValue: { role: before.role, status: before.status }, newValue: { role: after.role, status: after.status } });
  return after;
}

export async function removeMember(ctx: ReqCtx, shopId: string, memberId: string) {
  await getShop(ctx, shopId);
  const member = await prisma.shopMembership.findFirst({ where: { id: memberId, shopId, deletedAt: null } });
  if (!member) throw new HttpError(404, 'MEMBER_NOT_FOUND', 'Member not found');
  if (member.role === 'OWNER') {
    const owners = await prisma.shopMembership.count({ where: { shopId, role: 'OWNER', status: 'ACTIVE', deletedAt: null } });
    if (owners <= 1) throw new HttpError(403, 'FORBIDDEN', 'Cannot remove the last owner');
  }
  if (member.accountId === ctx.actor.accountId) throw new HttpError(403, 'FORBIDDEN', 'You cannot remove yourself');
  await prisma.$transaction(async (tx) => {
    await tx.shopMembership.update({ where: { id: memberId }, data: { deletedAt: new Date(), status: 'BLOCKED' } });
    await tx.refreshToken.updateMany({ where: { actorType: 'account', actorId: member.accountId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await writeAudit({ ...ctx, action: 'MEMBER_REMOVED', entityType: 'shop_membership', entityId: memberId, shopId, severity: 'HIGH' });
  return { removed: true };
}
