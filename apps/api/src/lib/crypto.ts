import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import type { Actor } from '@raghumaya/shared';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomCode(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function randomReferralCode(prefix = 'RMS'): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

interface AccessPayload {
  type: 'access';
  actorType: 'account' | 'admin';
  accountId?: string;
  adminId?: string;
  activeShopId?: string | null;
}

interface RefreshPayload {
  type: 'refresh';
  jti: string;
  actorType: 'account' | 'admin';
  accountId?: string;
  adminId?: string;
}

interface ChallengePayload {
  type: '2fa-challenge';
  jti: string;
  actorType: 'account' | 'admin';
  accountId?: string;
  adminId?: string;
}

export function signAccessToken(actor: Pick<Actor, 'actorType' | 'accountId' | 'adminId' | 'activeShopId'>): string {
  const payload: AccessPayload = {
    type: 'access',
    actorType: actor.actorType,
    accountId: actor.accountId,
    adminId: actor.adminId,
    activeShopId: actor.activeShopId ?? null,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL_MINUTES * 60 });
}

export function signRefreshToken(
  actor: Pick<Actor, 'actorType' | 'accountId' | 'adminId'>,
  jti: string,
): string {
  const payload: RefreshPayload = {
    type: 'refresh',
    jti,
    actorType: actor.actorType,
    accountId: actor.accountId,
    adminId: actor.adminId,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_TTL_DAYS * 24 * 3600 });
}

export function signChallengeToken(actor: Pick<Actor, 'actorType' | 'accountId' | 'adminId'>): string {
  const payload: ChallengePayload = {
    type: '2fa-challenge',
    jti: crypto.randomUUID(),
    actorType: actor.actorType,
    accountId: actor.accountId,
    adminId: actor.adminId,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: 10 * 60 });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessPayload & { type: string };
  if (decoded.type !== 'access') throw new Error('Not an access token');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as RefreshPayload & { type: string };
  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
  return decoded;
}

export function verifyChallengeToken(token: string): ChallengePayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as ChallengePayload & { type: string };
  if (decoded.type !== '2fa-challenge') throw new Error('Not a challenge token');
  return decoded;
}

export function decodeTokenUnsafe(token: string): Record<string, unknown> | null {
  try {
    return jwt.decode(token) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}
