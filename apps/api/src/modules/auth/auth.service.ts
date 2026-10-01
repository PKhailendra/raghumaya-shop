import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { Actor, LoginResult, TokenPair } from '@raghumaya/shared';
import { DEFAULT_ROLE_PERMISSIONS } from '@raghumaya/shared';
import { prisma } from '../../lib/prisma';
import {
  hashPassword,
  verifyPassword,
  sha256,
  randomToken,
  randomCode,
  randomReferralCode,
  signAccessToken,
  signRefreshToken,
  signChallengeToken,
  verifyRefreshToken,
} from '../../lib/crypto';
import { writeAudit } from '../../lib/audit';
import { deviceFingerprint, sendSms } from '../../lib/helpers';
import { getPagination, pageMeta } from '../../lib/utils';
import { env, isProduction } from '../../config/env';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { actorSummaryOf } from '../ctx';
import type { Request } from 'express';

const REFRESH_TTL_MS = env.JWT_REFRESH_TTL_DAYS * 24 * 3600 * 1000;

interface DeviceInfo {
  deviceId?: string;
  fingerprint: string;
  name?: string;
  type?: string;
  platform?: string;
  browser?: string;
  userAgent?: string;
  ip?: string;
}

export function deviceInfoFromReq(req: Request): DeviceInfo {
  const { fingerprint, fields } = deviceFingerprint(req);
  return {
    deviceId: fields.deviceId || fingerprint.slice(0, 16),
    fingerprint,
    name: fields.deviceName,
    type: fields.deviceType,
    platform: fields.devicePlatform,
    browser: fields.deviceBrowser,
    userAgent: fields.userAgent,
    ip: fields.ip,
  };
}

type ActorRecord =
  | { kind: 'account'; row: { id: string; fullName: string; email: string | null; phone: string; passwordHash?: string; status?: string } }
  | { kind: 'admin'; row: { id: string; fullName: string; email: string | null; phone: string | null; passwordHash?: string; status?: string } };

function actorKey(record: ActorRecord): { actorType: 'account' | 'admin'; accountId?: string; adminId?: string } {
  return record.kind === 'account'
    ? { actorType: 'account', accountId: record.row.id }
    : { actorType: 'admin', adminId: record.row.id };
}

async function defaultActiveShopId(accountId: string): Promise<string | null> {
  const membership = await prisma.shopMembership.findFirst({
    where: { accountId, status: 'ACTIVE', deletedAt: null },
    orderBy: [{ lastAccessedAt: 'desc' }, { joinedAt: 'desc' }],
    select: { shopId: true },
  });
  return membership?.shopId ?? null;
}

async function upsertDevice(
  actorType: 'account' | 'admin',
  actorId: string,
  device: DeviceInfo,
): Promise<void> {
  await prisma.device.upsert({
    where: { actorType_actorId_deviceId: { actorType, actorId, deviceId: device.deviceId ?? 'unknown' } },
    update: {
      fingerprint: device.fingerprint,
      name: device.name,
      type: device.type,
      platform: device.platform,
      browser: device.browser,
      userAgent: device.userAgent,
      ipAddress: device.ip,
      lastSeenAt: new Date(),
      revokedAt: null,
      deletedAt: null,
    },
    create: {
      actorType,
      actorId,
      deviceId: device.deviceId ?? 'unknown',
      fingerprint: device.fingerprint,
      name: device.name,
      type: device.type,
      platform: device.platform,
      browser: device.browser,
      userAgent: device.userAgent,
      ipAddress: device.ip,
    },
  });
}

export async function issueTokenPair(
  record: ActorRecord,
  device: DeviceInfo,
  ctx: Pick<ReqCtx, 'ip' | 'userAgent'>,
): Promise<{ tokens: TokenPair; actor: Actor }> {
  const key = actorKey(record);
  const activeShopId = record.kind === 'account' ? await defaultActiveShopId(record.row.id) : null;

  const accessToken = signAccessToken({ ...key, activeShopId });
  const jti = randomUUID();
  const refreshToken = signRefreshToken(key, jti);

  await prisma.refreshToken.create({
    data: {
      actorType: key.actorType,
      actorId: record.row.id,
      deviceId: device.deviceId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  await upsertDevice(key.actorType, record.row.id, device);

  const now = new Date();
  if (record.kind === 'account') {
    await prisma.account.update({ where: { id: record.row.id }, data: { lastLoginAt: now } });
  } else {
    await prisma.admin.update({ where: { id: record.row.id }, data: { lastLoginAt: now } });
  }

  const actor: Actor = {
    ...key,
    activeShopId,
    role: record.kind === 'account' ? null : (((record.row as { role?: string }).role ?? null) as never),
    permissions: [],
  };
  return {
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_TTL_MINUTES * 60,
      tokenType: 'Bearer',
    },
    actor,
  };
}

async function twoFactorRequiredFor(actorType: 'account' | 'admin', actorId: string): Promise<string[]> {
  const settings = await prisma.twoFactorSetting.findFirst({
    where: { actorType, actorId, deletedAt: null },
  });
  if (settings && settings.enabled && settings.methods.length > 0) return settings.methods;
  return [];
}

async function findLoginIdentity(emailOrPhone: string): Promise<ActorRecord | null> {
  const needle = emailOrPhone.trim();
  const admin = await prisma.admin.findFirst({
    where: { email: { equals: needle, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, fullName: true, email: true, phone: true, passwordHash: true, status: true, role: true },
  });
  if (admin) return { kind: 'admin', row: admin };
  const account = await prisma.account.findFirst({
    where: {
      OR: [{ email: { equals: needle, mode: 'insensitive' } }, { phone: needle }],
      deletedAt: null,
    },
    select: { id: true, fullName: true, email: true, phone: true, passwordHash: true, status: true },
  });
  if (account) return { kind: 'account', row: account };
  return null;
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export async function registerShopOwner(
  input: {
    shopName: string;
    fullName: string;
    email?: string;
    phone: string;
    password: string;
    referralCode?: string;
    shopPhone?: string;
    shopAddress?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gstNumber?: string;
  },
  device: DeviceInfo,
  ctx: ReqCtx,
): Promise<{ account: unknown; shop: unknown; tokens: TokenPair }> {
  const existing = await prisma.account.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])], deletedAt: null },
  });
  if (existing) throw new HttpError(409, 'ACCOUNT_EXISTS', 'An account with this phone or email already exists');

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        status: 'ACTIVE',
      },
    });
    const shop = await tx.shop.create({
      data: {
        name: input.shopName,
        ownerAccountId: account.id,
        phone: input.shopPhone ?? input.phone,
        address: input.shopAddress,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        gstNumber: input.gstNumber,
        status: 'ACTIVE',
      },
    });
    const membership = await tx.shopMembership.create({
      data: { shopId: shop.id, accountId: account.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    await tx.warehouse.create({
      data: { shopId: shop.id, name: 'Main Warehouse', code: 'MAIN', isDefault: true },
    });

    // Referral conversion
    if (input.referralCode) {
      const code = await tx.referralCode.findFirst({
        where: { code: input.referralCode.trim().toUpperCase(), deletedAt: null },
      });
      if (code && code.status === 'ACTIVE' && (!code.expiresAt || code.expiresAt > new Date())) {
        if (!code.maxUses || code.usedCount < code.maxUses) {
          await tx.referral.create({
            data: {
              codeId: code.id,
              referrerShopId: code.shopId,
              referredShopId: shop.id,
              referredAccountId: account.id,
              status: 'CONVERTED',
              rewardStatus: 'EARNED',
              rewardAmount: code.rewardAmount,
              convertedAt: new Date(),
            },
          });
          await tx.referralCode.update({ where: { id: code.id }, data: { usedCount: { increment: 1 } } });
        }
      }
    }
    return { account, shop, membership };
  });

  const { tokens } = await issueTokenPair(
    { kind: 'account', row: { id: result.account.id, fullName: result.account.fullName, email: result.account.email, phone: result.account.phone } },
    device,
    ctx,
  );

  await writeAudit({
    ...ctx,
    actor: { actorType: 'account', accountId: result.account.id, activeShopId: result.shop.id, role: 'OWNER', permissions: [] },
    action: 'SHOP_REGISTERED',
    entityType: 'shop',
    entityId: result.shop.id,
    shopId: result.shop.id,
    category: 'AUTH',
    metadata: { shopName: result.shop.name },
  });

  return {
    account: { id: result.account.id, fullName: result.account.fullName, email: result.account.email, phone: result.account.phone },
    shop: { id: result.shop.id, name: result.shop.name },
    tokens,
  };
}

export async function createShopUser(
  ctx: ReqCtx,
  input: { fullName: string; email?: string; phone: string; password?: string; role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT' | 'INVENTORY_STAFF' | 'STAFF'; permissions?: string[] },
): Promise<unknown> {
  const shopId = ctx.actor.activeShopId;
  if (!shopId) throw new HttpError(400, 'SHOP_CONTEXT_REQUIRED', 'Select a shop first');
  if (input.role === 'OWNER') throw new HttpError(403, 'FORBIDDEN', 'Cannot assign OWNER role via this endpoint');

  const existing = await prisma.account.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])], deletedAt: null },
  });
  const passwordHash = await hashPassword(input.password ?? randomToken(12));
  const result = await prisma.$transaction(async (tx) => {
    const account =
      existing ??
      (await tx.account.create({
        data: { fullName: input.fullName, email: input.email, phone: input.phone, passwordHash, status: 'ACTIVE' },
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

  await writeAudit({
    ...ctx,
    action: 'SHOP_USER_CREATED',
    entityType: 'shop_membership',
    entityId: result.membership.id,
    shopId,
    category: 'AUTH',
    metadata: { role: input.role },
  });
  return { id: result.account.id, fullName: result.account.fullName, email: result.account.email, phone: result.account.phone, role: result.membership.role };
}

/* ------------------------------------------------------------------ */
/* Login / logout / refresh                                            */
/* ------------------------------------------------------------------ */

export async function login(
  input: { emailOrPhone: string; password: string },
  device: DeviceInfo,
  ctx: Pick<ReqCtx, 'ip' | 'userAgent'>,
): Promise<LoginResult> {
  const identity = await findLoginIdentity(input.emailOrPhone);
  if (!identity) {
    await writeAudit({ ...ctx, action: 'LOGIN_FAILED', entityType: 'account', category: 'AUTH', severity: 'HIGH', metadata: { emailOrPhone: input.emailOrPhone, reason: 'not_found' } });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email/phone or password');
  }
  const full = identity.row;
  if (!full.passwordHash || !(await verifyPassword(input.password, full.passwordHash))) {
    await writeAudit({ ...ctx, action: 'LOGIN_FAILED', entityType: identity.kind, category: 'AUTH', severity: 'HIGH', metadata: { reason: 'bad_password' } });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email/phone or password');
  }
  if (full.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_BLOCKED', `Account is ${full.status}`);

  const key = actorKey(identity);
  const methods = await twoFactorRequiredFor(key.actorType, identity.row.id);
  const summary = actorSummaryOf(
    key.actorType,
    identity.row,
    identity.kind === 'admin' ? (identity.row as { role?: string }).role : undefined,
  );

  if (methods.length > 0) {
    const challengeToken = signChallengeToken(key);
    await writeAudit({ ...ctx, actor: { ...key, permissions: [] }, action: 'LOGIN_2FA_CHALLENGE', entityType: identity.kind, entityId: identity.row.id, category: 'AUTH', severity: 'MEDIUM' });
    return {
      twoFactorRequired: true,
      challengeToken,
      methods: methods as ('AUTHENTICATOR' | 'SMS' | 'EMAIL' | 'BACKUP_CODE')[],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      actor: summary,
    };
  }

  const { tokens, actor } = await issueTokenPair(identity, device, ctx);
  await writeAudit({ ...ctx, actor, action: 'LOGIN', entityType: identity.kind, entityId: identity.row.id, category: 'AUTH' });
  return { ...tokens, actor: { ...summary, activeShopId: actor.activeShopId ?? null } };
}

export async function logout(ctx: ReqCtx, input: { refreshToken?: string; allDevices?: boolean }, device: DeviceInfo): Promise<{ revoked: number }> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  let revoked = 0;
  if (input.allDevices) {
    const r = await prisma.refreshToken.updateMany({
      where: { actorType: actor.actorType, actorId, revokedAt: null, deletedAt: null },
      data: { revokedAt: new Date() },
    });
    revoked = r.count;
  } else if (input.refreshToken) {
    const r = await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(input.refreshToken), revokedAt: null, deletedAt: null },
      data: { revokedAt: new Date() },
    });
    revoked = r.count;
  } else if (device.deviceId) {
    const r = await prisma.refreshToken.updateMany({
      where: { actorType: actor.actorType, actorId, deviceId: device.deviceId, revokedAt: null, deletedAt: null },
      data: { revokedAt: new Date() },
    });
    revoked = r.count;
  }
  await writeAudit({ ...ctx, action: 'LOGOUT', entityType: actor.actorType, entityId: actorId, category: 'AUTH', metadata: { allDevices: !!input.allDevices } });
  return { revoked };
}

export async function refresh(
  refreshToken: string,
  device: DeviceInfo,
  ctx: Pick<ReqCtx, 'ip' | 'userAgent'>,
): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }
  const stored = await prisma.refreshToken.findFirst({
    where: { tokenHash: sha256(refreshToken), revokedAt: null, deletedAt: null },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
  }
  // rotate: revoke old, issue new
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const actorId = payload.accountId ?? payload.adminId!;
  let record: ActorRecord;
  if (payload.actorType === 'account') {
    const row = await prisma.account.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true, fullName: true, email: true, phone: true, status: true } });
    if (!row || row.status !== 'ACTIVE') throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Account unavailable');
    record = { kind: 'account', row: { id: row.id, fullName: row.fullName, email: row.email, phone: row.phone } };
  } else {
    const row = await prisma.admin.findFirst({ where: { id: actorId, deletedAt: null }, select: { id: true, fullName: true, email: true, phone: true, status: true } });
    if (!row || row.status !== 'ACTIVE') throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Admin unavailable');
    record = { kind: 'admin', row: { id: row.id, fullName: row.fullName, email: row.email, phone: row.phone } };
  }
  const { tokens } = await issueTokenPair(record, device, ctx);
  await writeAudit({ ...ctx, actor: { ...actorKey(record), permissions: [] }, action: 'TOKEN_REFRESHED', entityType: record.kind, entityId: actorId, category: 'AUTH' });
  return tokens;
}

export async function changePassword(ctx: ReqCtx, input: { currentPassword: string; newPassword: string }): Promise<{ changed: boolean }> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const repo = actor.actorType === 'admin' ? prisma.admin : prisma.account;
  const row = await (repo as typeof prisma.account).findFirst({ where: { id: actorId } });
  if (!row || !(await verifyPassword(input.currentPassword, (row as { passwordHash: string }).passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  await (repo as typeof prisma.account).update({ where: { id: actorId }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await prisma.refreshToken.updateMany({
    where: { actorType: actor.actorType, actorId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit({ ...ctx, action: 'PASSWORD_CHANGED', entityType: actor.actorType, entityId: actorId, category: 'AUTH', severity: 'MEDIUM' });
  return { changed: true };
}

/* ------------------------------------------------------------------ */
/* Password reset                                                      */
/* ------------------------------------------------------------------ */

export async function forgotPassword(emailOrPhone: string): Promise<{ accepted: boolean; debugToken?: string }> {
  const identity = await findLoginIdentity(emailOrPhone);
  if (!identity) return { accepted: true }; // never enumerate accounts
  const key = actorKey(identity);
  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: {
      actorType: key.actorType,
      actorId: identity.row.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[password-reset] token for ${emailOrPhone}: ${token}`);
  await writeAudit({ action: 'PASSWORD_RESET_REQUESTED', entityType: identity.kind, entityId: identity.row.id, category: 'AUTH', severity: 'MEDIUM' });
  return { accepted: true, ...(isProduction ? {} : { debugToken: token }) };
}

export async function resetPassword(token: string, newPassword: string): Promise<{ reset: boolean }> {
  const stored = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, deletedAt: null },
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', 'Reset token is invalid or expired');
  }
  const repo = stored.actorType === 'admin' ? prisma.admin : prisma.account;
  await prisma.$transaction(async (tx) => {
    await (repo as typeof tx.account).update({ where: { id: stored.actorId }, data: { passwordHash: await hashPassword(newPassword) } });
    await tx.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
    await tx.refreshToken.updateMany({ where: { actorType: stored.actorType, actorId: stored.actorId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await writeAudit({ action: 'PASSWORD_RESET', entityType: stored.actorType, entityId: stored.actorId, category: 'AUTH', severity: 'MEDIUM' });
  return { reset: true };
}

/* ------------------------------------------------------------------ */
/* OTP login                                                           */
/* ------------------------------------------------------------------ */

async function issueVerificationCode(channel: 'EMAIL' | 'SMS', purpose: string, identifier: string, ttlMinutes: number): Promise<string> {
  const code = randomCode(6);
  await prisma.verificationToken.create({
    data: { channel, purpose, identifier, codeHash: sha256(code), expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000) },
  });
  return code;
}

async function consumeVerificationCode(channel: string, purpose: string, identifier: string, code: string): Promise<boolean> {
  const token = await prisma.verificationToken.findFirst({
    where: { channel, purpose, identifier, consumedAt: null, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!token || token.expiresAt < new Date()) return false;
  if (token.attempts >= token.maxAttempts) return false;
  if (token.codeHash !== sha256(code.trim())) {
    await prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
  return true;
}

export async function otpRequest(emailOrPhone: string): Promise<{ sent: boolean; debugCode?: string }> {
  const identity = await findLoginIdentity(emailOrPhone);
  if (!identity) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No account found for this email/phone');
  const full = identity.row;
  if (full.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_BLOCKED', `Account is ${full.status}`);
  const channel = emailOrPhone.includes('@') ? 'EMAIL' : 'SMS';
  const code = await issueVerificationCode(channel, 'LOGIN', emailOrPhone.trim(), 10);
  if (channel === 'SMS') {
    await sendSms({ to: emailOrPhone.trim(), message: `Your RaghuMayaShop login OTP is ${code}. Valid for 10 minutes.` });
  } else {
    // eslint-disable-next-line no-console
    console.log(`[email-otp] to ${emailOrPhone}: ${code}`);
  }
  return { sent: true, ...(isProduction ? {} : { debugCode: code }) };
}

export async function otpVerify(
  emailOrPhone: string,
  code: string,
  device: DeviceInfo,
  ctx: Pick<ReqCtx, 'ip' | 'userAgent'>,
): Promise<TokenPair & { actor: ReturnType<typeof actorSummaryOf> }> {
  const channel = emailOrPhone.includes('@') ? 'EMAIL' : 'SMS';
  const ok = await consumeVerificationCode(channel, 'LOGIN', emailOrPhone.trim(), code);
  if (!ok) {
    await writeAudit({ ...ctx, action: 'OTP_VERIFY_FAILED', entityType: 'account', category: 'AUTH', severity: 'HIGH', metadata: { emailOrPhone } });
    throw new HttpError(401, 'INVALID_OTP', 'Invalid or expired OTP');
  }
  const identity = await findLoginIdentity(emailOrPhone);
  if (!identity) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No account found for this email/phone');
  const { tokens, actor } = await issueTokenPair(identity, device, ctx);
  await writeAudit({ ...ctx, actor, action: 'OTP_LOGIN', entityType: identity.kind, entityId: identity.row.id, category: 'AUTH' });
  return { ...tokens, actor: actorSummaryOf(actor.actorType, identity.row, identity.kind === 'admin' ? (identity.row as { role?: string }).role : undefined, actor.activeShopId) };
}

/* ------------------------------------------------------------------ */
/* Email / SMS verification                                            */
/* ------------------------------------------------------------------ */

export async function emailRequestVerification(ctx: ReqCtx): Promise<{ sent: boolean; debugCode?: string }> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const repo = actor.actorType === 'admin' ? prisma.admin : prisma.account;
  const row = await (repo as typeof prisma.account).findFirst({ where: { id: actorId }, select: { email: true } });
  const email = (row as { email: string | null } | null)?.email;
  if (!email) throw new HttpError(400, 'NO_EMAIL', 'No email address on this account');
  const code = await issueVerificationCode('EMAIL', 'EMAIL_VERIFY', email, 15);
  // eslint-disable-next-line no-console
  console.log(`[email-verify] to ${email}: ${code}`);
  return { sent: true, ...(isProduction ? {} : { debugCode: code }) };
}

export async function emailVerify(email: string, code: string): Promise<{ verified: boolean }> {
  const ok = await consumeVerificationCode('EMAIL', 'EMAIL_VERIFY', email.trim(), code);
  if (!ok) throw new HttpError(401, 'INVALID_CODE', 'Invalid or expired verification code');
  const account = await prisma.account.findFirst({ where: { email: email.trim(), deletedAt: null } });
  if (account) await prisma.account.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
  const admin = await prisma.admin.findFirst({ where: { email: email.trim(), deletedAt: null } });
  if (admin) await prisma.admin.update({ where: { id: admin.id }, data: { emailVerifiedAt: new Date() } });
  if (!account && !admin) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No account found for this email');
  await writeAudit({ action: 'EMAIL_VERIFIED', entityType: account ? 'account' : 'admin', entityId: (account ?? admin)!.id, category: 'AUTH' });
  return { verified: true };
}

export async function smsRequestVerification(ctx: ReqCtx): Promise<{ sent: boolean; debugCode?: string }> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const repo = actor.actorType === 'admin' ? prisma.admin : prisma.account;
  const row = await (repo as typeof prisma.account).findFirst({ where: { id: actorId }, select: { phone: true } });
  const phone = (row as { phone: string | null } | null)?.phone;
  if (!phone) throw new HttpError(400, 'NO_PHONE', 'No phone number on this account');
  const code = await issueVerificationCode('SMS', 'SMS_VERIFY', phone, 15);
  await sendSms({ to: phone, message: `Your RaghuMayaShop verification code is ${code}. Valid for 15 minutes.` });
  return { sent: true, ...(isProduction ? {} : { debugCode: code }) };
}

export async function smsVerify(phone: string, code: string): Promise<{ verified: boolean }> {
  const ok = await consumeVerificationCode('SMS', 'SMS_VERIFY', phone.trim(), code);
  if (!ok) throw new HttpError(401, 'INVALID_CODE', 'Invalid or expired verification code');
  const account = await prisma.account.findFirst({ where: { phone: phone.trim(), deletedAt: null } });
  if (account) await prisma.account.update({ where: { id: account.id }, data: { phoneVerifiedAt: new Date() } });
  const admin = await prisma.admin.findFirst({ where: { phone: phone.trim(), deletedAt: null } });
  if (admin) await prisma.admin.update({ where: { id: admin.id }, data: { phoneVerifiedAt: new Date() } });
  if (!account && !admin) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No account found for this phone');
  await writeAudit({ action: 'PHONE_VERIFIED', entityType: account ? 'account' : 'admin', entityId: (account ?? admin)!.id, category: 'AUTH' });
  return { verified: true };
}

/* ------------------------------------------------------------------ */
/* Platform admins (super admin only)                                  */
/* ------------------------------------------------------------------ */

export async function createAdmin(
  ctx: ReqCtx,
  input: { fullName: string; email: string; phone?: string; password: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'AUDITOR'; permissions?: string[] },
): Promise<unknown> {
  const existing = await prisma.admin.findFirst({
    where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])], deletedAt: null },
  });
  if (existing) throw new HttpError(409, 'ADMIN_EXISTS', 'An admin with this email/phone already exists');
  const admin = await prisma.admin.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      permissions: input.permissions ?? [],
      status: 'ACTIVE',
      createdByAdminId: ctx.actor.adminId,
    },
  });
  await writeAudit({ ...ctx, action: 'ADMIN_CREATED', entityType: 'admin', entityId: admin.id, category: 'ADMIN', severity: 'MEDIUM', metadata: { role: input.role } });
  return { id: admin.id, fullName: admin.fullName, email: admin.email, phone: admin.phone, role: admin.role };
}

export async function listAdmins(page = 1, limit = 20, search?: string) {
  const { skip, take } = getPagination(page, limit);
  const where = {
    deletedAt: null,
    ...(search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.admin.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: { id: true, fullName: true, email: true, phone: true, role: true, status: true, lastLoginAt: true, createdAt: true } }),
    prisma.admin.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, page, limit) };
}

export async function updateAdmin(ctx: ReqCtx, id: string, input: { fullName?: string; email?: string | null; phone?: string; role?: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'AUDITOR'; permissions?: string[] }): Promise<unknown> {
  const before = await prisma.admin.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new HttpError(404, 'ADMIN_NOT_FOUND', 'Admin not found');
  if (before.id === ctx.actor.adminId && input.role && input.role !== before.role) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot change your own role');
  }
  const data: Prisma.AdminUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.email !== undefined && input.email !== null) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.role !== undefined) data.role = input.role;
  if (input.permissions !== undefined) data.permissions = input.permissions;
  const after = await prisma.admin.update({ where: { id }, data });
  await writeAudit({ ...ctx, action: 'ADMIN_UPDATED', entityType: 'admin', entityId: id, category: 'ADMIN', severity: 'MEDIUM', oldValue: { role: before.role }, newValue: { role: after.role } });
  return { id: after.id, fullName: after.fullName, email: after.email, role: after.role, status: after.status };
}

export async function deleteAdmin(ctx: ReqCtx, id: string): Promise<{ deleted: boolean }> {
  if (id === ctx.actor.adminId) throw new HttpError(403, 'FORBIDDEN', 'You cannot delete your own account');
  const admin = await prisma.admin.findFirst({ where: { id, deletedAt: null } });
  if (!admin) throw new HttpError(404, 'ADMIN_NOT_FOUND', 'Admin not found');
  await prisma.$transaction(async (tx) => {
    await tx.admin.update({ where: { id }, data: { deletedAt: new Date(), status: 'BLOCKED' } });
    await tx.refreshToken.updateMany({ where: { actorType: 'admin', actorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await writeAudit({ ...ctx, action: 'ADMIN_DELETED', entityType: 'admin', entityId: id, category: 'ADMIN', severity: 'HIGH' });
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Devices & sessions                                                  */
/* ------------------------------------------------------------------ */

export async function listDevices(ctx: ReqCtx) {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const rows = await prisma.device.findMany({
    where: { actorType: actor.actorType, actorId, deletedAt: null },
    orderBy: { lastSeenAt: 'desc' },
  });
  return rows.map((d) => ({ ...d, fingerprint: `${d.fingerprint.slice(0, 12)}…` }));
}

export function fingerprintFromReq(req: Request): { fingerprint: string; fields: Record<string, string | undefined> } {
  return deviceFingerprint(req);
}

export async function revokeDevice(ctx: ReqCtx, id: string): Promise<{ revoked: boolean }> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const device = await prisma.device.findFirst({ where: { id, actorType: actor.actorType, actorId, deletedAt: null } });
  if (!device) throw new HttpError(404, 'DEVICE_NOT_FOUND', 'Device not found');
  await prisma.$transaction(async (tx) => {
    await tx.device.update({ where: { id }, data: { revokedAt: new Date() } });
    await tx.refreshToken.updateMany({
      where: { actorType: actor.actorType, actorId, deviceId: device.deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  await writeAudit({ ...ctx, action: 'DEVICE_REMOVED', entityType: 'device', entityId: id, category: 'AUTH', severity: 'MEDIUM' });
  return { revoked: true };
}

export async function listSessions(ctx: ReqCtx) {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  return prisma.refreshToken.findMany({
    where: { actorType: actor.actorType, actorId, revokedAt: null, expiresAt: { gt: new Date() }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceId: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
  });
}

/* ------------------------------------------------------------------ */
/* Profile change requests (approval workflow)                         */
/* ------------------------------------------------------------------ */

export async function requestProfileChange(
  ctx: ReqCtx,
  input: { entityType: 'account' | 'shop' | 'membership'; entityId?: string; changes: Record<string, unknown>; reason?: string },
): Promise<unknown> {
  const actor = ctx.actor;
  const actorId = actor.actorType === 'admin' ? actor.adminId! : actor.accountId!;
  const change = await prisma.userProfileChange.create({
    data: {
      requesterType: actor.actorType,
      requesterId: actorId,
      shopId: actor.activeShopId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      changes: input.changes as never,
      reason: input.reason,
      status: 'PENDING',
    },
  });
  await writeAudit({ ...ctx, action: 'PROFILE_CHANGE_REQUESTED', entityType: 'user_profile_change', entityId: change.id, category: 'ADMIN' });
  return change;
}

export { issueVerificationCode, consumeVerificationCode };
