import type { TwoFaMethod } from '@raghumaya/shared';
import { prisma } from '../../lib/prisma';
import { verifyChallengeToken, signChallengeToken } from '../../lib/crypto';
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotp,
  encryptSecret,
  generateBackupCodes,
  consumeBackupCode,
  type StoredBackupCode,
} from '../../lib/totp';
import { writeAudit } from '../../lib/audit';
import { sendSms } from '../../lib/helpers';
import { getRedis, isRedisAvailable } from '../../lib/redis';
import { isProduction } from '../../config/env';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { issueTokenPair, issueVerificationCode, consumeVerificationCode, deviceInfoFromReq } from './auth.service';
import type { Request } from 'express';

const MANAGEABLE_METHODS = ['AUTHENTICATOR', 'SMS', 'EMAIL'] as const;

/* ------------------------------------------------------------------ */
/* Challenge consumption — a challenge token is single-use. Its jti is */
/* recorded on successful verification so replays are rejected even    */
/* before the 10-minute JWT expiry. Redis preferred, in-memory fallback.*/
/* ------------------------------------------------------------------ */
const consumedChallenges = new Map<string, number>();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function challengeKey(jti: string): string {
  return `2fa:consumed:${jti}`;
}

async function isChallengeConsumed(jti: string): Promise<boolean> {
  if (isRedisAvailable()) {
    return (await getRedis()!.exists(challengeKey(jti))) === 1;
  }
  const exp = consumedChallenges.get(jti);
  if (exp === undefined) return false;
  if (exp < Date.now()) {
    consumedChallenges.delete(jti);
    return false;
  }
  return true;
}

async function consumeChallenge(jti: string): Promise<void> {
  if (isRedisAvailable()) {
    await getRedis()!.set(challengeKey(jti), '1', 'PX', CHALLENGE_TTL_MS);
    return;
  }
  consumedChallenges.set(jti, Date.now() + CHALLENGE_TTL_MS);
}

function actorKeyOf(ctx: ReqCtx): { actorType: 'account' | 'admin'; actorId: string } {
  const a = ctx.actor;
  return { actorType: a.actorType, actorId: a.actorType === 'admin' ? a.adminId! : a.accountId! };
}

async function getSettings(actorType: 'account' | 'admin', actorId: string) {
  return prisma.twoFactorSetting.findFirst({ where: { actorType, actorId, deletedAt: null } });
}

export async function getStatus(ctx: ReqCtx) {
  const { actorType, actorId } = actorKeyOf(ctx);
  const s = await getSettings(actorType, actorId);
  const codes = (s?.backupCodes as StoredBackupCode[] | null) ?? [];
  return {
    enabled: s?.enabled ?? false,
    methods: (s?.methods ?? []) as TwoFaMethod[],
    hasAuthenticator: !!s?.totpVerifiedAt,
    backupCodesRemaining: codes.filter((c) => !c.usedAt).length,
    updatedAt: s?.updatedAt ?? null,
  };
}

export async function updateMethods(ctx: ReqCtx, input: { methods: Array<'AUTHENTICATOR' | 'SMS' | 'EMAIL'>; enabled?: boolean }) {
  const { actorType, actorId } = actorKeyOf(ctx);
  for (const m of input.methods) {
    if (!(MANAGEABLE_METHODS as readonly string[]).includes(m)) {
      throw new HttpError(400, 'INVALID_METHOD', `Unsupported 2FA method: ${m}`);
    }
  }
  let s = await getSettings(actorType, actorId);
  if (input.methods.includes('AUTHENTICATOR')) {
    const existing = s;
    if (!existing?.totpVerifiedAt) throw new HttpError(400, 'AUTHENTICATOR_NOT_VERIFIED', 'Verify the authenticator app first');
  }
  const enabled = input.enabled ?? true;
  if (s) {
    s = await prisma.twoFactorSetting.update({
      where: { id: s.id },
      data: { methods: enabled ? input.methods : [], enabled },
    });
  } else {
    s = await prisma.twoFactorSetting.create({
      data: { actorType, actorId, methods: enabled ? input.methods : [], enabled },
    });
  }
  await writeAudit({ ...ctx, action: '2FA_METHODS_UPDATED', entityType: 'two_factor_setting', entityId: s.id, category: 'AUTH', severity: 'MEDIUM', metadata: { methods: s.methods, enabled: s.enabled } });
  return { enabled: s.enabled, methods: s.methods as TwoFaMethod[] };
}

export async function setupAuthenticator(ctx: ReqCtx, req: Request) {
  const { actorType, actorId } = actorKeyOf(ctx);
  const secret = generateTotpSecret();
  const label = actorType === 'admin' ? `admin:${actorId}` : `account:${actorId}`;
  const otpauthUrl = totpKeyUri(label, secret);
  const existing = await getSettings(actorType, actorId);
  const data = { totpSecretEncrypted: encryptSecret(secret), totpVerifiedAt: null as Date | null };
  if (existing) {
    await prisma.twoFactorSetting.update({ where: { id: existing.id }, data });
  } else {
    await prisma.twoFactorSetting.create({ data: { actorType, actorId, ...data, methods: [], enabled: false } });
  }
  await writeAudit({ ...ctx, action: '2FA_AUTHENTICATOR_SETUP_STARTED', entityType: 'two_factor_setting', category: 'AUTH', severity: 'MEDIUM' });
  return { secret, otpauthUrl };
}

export async function verifyAuthenticator(ctx: ReqCtx, token: string) {
  const { actorType, actorId } = actorKeyOf(ctx);
  const s = await getSettings(actorType, actorId);
  if (!s?.totpSecretEncrypted) throw new HttpError(400, 'NO_AUTHENTICATOR_SETUP', 'Run authenticator setup first');
  if (!verifyTotp(token, s.totpSecretEncrypted)) {
    await writeAudit({ ...ctx, action: '2FA_AUTHENTICATOR_VERIFY_FAILED', entityType: 'two_factor_setting', category: 'AUTH', severity: 'HIGH' });
    throw new HttpError(401, 'INVALID_TOTP', 'Invalid authenticator code');
  }
  const { plain, stored } = generateBackupCodes(10);
  const methods = Array.from(new Set([...(s.methods as string[]), 'AUTHENTICATOR']));
  await prisma.twoFactorSetting.update({
    where: { id: s.id },
    data: { totpVerifiedAt: new Date(), methods, enabled: true, backupCodes: stored as never, lastUsedAt: new Date() },
  });
  await writeAudit({ ...ctx, action: '2FA_ENABLED', entityType: 'two_factor_setting', entityId: s.id, category: 'AUTH', severity: 'MEDIUM', metadata: { method: 'AUTHENTICATOR' } });
  return { verified: true, enabled: true, methods: methods as TwoFaMethod[], backupCodes: plain };
}

export async function regenerateBackupCodes(ctx: ReqCtx) {
  const { actorType, actorId } = actorKeyOf(ctx);
  const s = await getSettings(actorType, actorId);
  if (!s?.enabled) throw new HttpError(400, '2FA_NOT_ENABLED', 'Enable 2FA before regenerating backup codes');
  const { plain, stored } = generateBackupCodes(10);
  await prisma.twoFactorSetting.update({ where: { id: s.id }, data: { backupCodes: stored as never } });
  await writeAudit({ ...ctx, action: '2FA_BACKUP_CODES_REGENERATED', entityType: 'two_factor_setting', entityId: s.id, category: 'AUTH', severity: 'MEDIUM' });
  return { backupCodes: plain };
}

async function loadChallengeActor(challengeToken: string) {
  let payload;
  try {
    payload = verifyChallengeToken(challengeToken);
  } catch {
    throw new HttpError(401, 'INVALID_CHALLENGE', 'Challenge token is invalid or expired');
  }
  if (await isChallengeConsumed(payload.jti)) {
    throw new HttpError(401, 'CHALLENGE_CONSUMED', 'Challenge token has already been used');
  }
  const actorId = payload.accountId ?? payload.adminId!;
  const row =
    payload.actorType === 'account'
      ? await prisma.account.findFirst({ where: { id: actorId, deletedAt: null } })
      : await prisma.admin.findFirst({ where: { id: actorId, deletedAt: null } });
  if (!row) throw new HttpError(401, 'INVALID_CHALLENGE', 'Account not found');
  return { payload, row };
}

export async function challengeSend(challengeToken: string, method: 'SMS' | 'EMAIL') {
  const { payload, row } = await loadChallengeActor(challengeToken);
  const contact = method === 'SMS' ? (row as { phone: string | null }).phone : (row as { email: string | null }).email;
  if (!contact) throw new HttpError(400, 'NO_CONTACT', `No ${method === 'SMS' ? 'phone number' : 'email'} on this account`);
  const code = await issueVerificationCode(method, 'TWO_FACTOR', contact, 10);
  if (method === 'SMS') {
    await sendSms({ to: contact, message: `Your RaghuMayaShop 2FA code is ${code}. Valid for 10 minutes.` });
  } else {
    // eslint-disable-next-line no-console
    console.log(`[2fa-email] to ${contact}: ${code}`);
  }
  await writeAudit({ action: '2FA_CHALLENGE_SENT', entityType: payload.actorType, entityId: (row as { id: string }).id, category: 'AUTH', severity: 'MEDIUM', metadata: { method } });
  return { sent: true, method, ...(isProduction ? {} : { debugCode: code }) };
}

export async function challengeVerify(
  req: Request,
  input: { challengeToken: string; method: TwoFaMethod; code?: string; token?: string },
) {
  const { payload, row } = await loadChallengeActor(input.challengeToken);
  const actorId = (row as { id: string }).id;
  const settings = await getSettings(payload.actorType, actorId);
  if (!settings?.enabled) throw new HttpError(400, '2FA_NOT_ENABLED', '2FA is not enabled for this account');

  const fail = async (reason: string) => {
    await writeAudit({ action: '2FA_CHALLENGE_FAILED', entityType: payload.actorType, entityId: actorId, category: 'AUTH', severity: 'HIGH', metadata: { method: input.method, reason } });
    throw new HttpError(401, 'INVALID_2FA_CODE', 'Invalid or expired 2FA code');
  };

  if (input.method === 'AUTHENTICATOR') {
    if (!input.token || !settings.totpSecretEncrypted || !verifyTotp(input.token, settings.totpSecretEncrypted)) {
      await fail('bad_totp');
    }
  } else if (input.method === 'BACKUP_CODE') {
    if (!input.code) await fail('missing_code');
    const stored = (settings.backupCodes as StoredBackupCode[] | null) ?? [];
    const next = consumeBackupCode(input.code!, stored);
    if (!next) await fail('bad_backup_code');
    await prisma.twoFactorSetting.update({ where: { id: settings.id }, data: { backupCodes: next as never } });
  } else if (input.method === 'SMS' || input.method === 'EMAIL') {
    const contact = input.method === 'SMS' ? (row as { phone: string | null }).phone : (row as { email: string | null }).email;
    if (!input.code || !contact) await fail('missing_code');
    const ok = await consumeVerificationCode(input.method, 'TWO_FACTOR', contact!, input.code!);
    if (!ok) await fail('bad_otp');
  } else {
    throw new HttpError(400, 'INVALID_METHOD', 'Unsupported 2FA method');
  }

  await prisma.twoFactorSetting.update({ where: { id: settings.id }, data: { lastUsedAt: new Date() } });
  const record =
    payload.actorType === 'account'
      ? { kind: 'account' as const, row: { id: actorId, fullName: (row as { fullName: string }).fullName, email: (row as { email: string | null }).email, phone: (row as { phone: string }).phone } }
      : { kind: 'admin' as const, row: { id: actorId, fullName: (row as { fullName: string }).fullName, email: (row as { email: string | null }).email, phone: (row as { phone: string | null }).phone } };
  const device = deviceInfoFromReq(req);
  const { tokens, actor } = await issueTokenPair(record, device, { ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
  // Consume the challenge so it cannot be replayed, then hand the client a
  // fresh challenge token for any follow-up 2FA step.
  await consumeChallenge(payload.jti);
  const _rotated = signChallengeToken({ actorType: payload.actorType, accountId: payload.accountId, adminId: payload.adminId });
  await writeAudit({ actor, action: '2FA_VERIFIED_LOGIN', entityType: payload.actorType, entityId: actorId, category: 'AUTH' });
  return { ...tokens, challengeToken: _rotated };
}
