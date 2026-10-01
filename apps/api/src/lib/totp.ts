import crypto from 'crypto';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { sha256 } from './crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/** Encrypt a TOTP secret before storage (AES-256-GCM). Format: iv:authTag:ciphertext (hex). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted secret');
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(accountName: string, secret: string, issuer = 'RaghuMayaShop'): string {
  return authenticator.keyuri(accountName, issuer, secret);
}

export function verifyTotp(token: string, encryptedSecret: string, window = 1): boolean {
  const secret = decryptSecret(encryptedSecret);
  // otplib v12: window is an instance option, so scope it per call.
  return authenticator.create({ window }).check(token, secret);
}

export interface StoredBackupCode {
  hash: string;
  usedAt: string | null;
}

export function generateBackupCodes(count = 10): { plain: string[]; stored: StoredBackupCode[] } {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    plain.push(`${part1}-${part2}`);
  }
  const stored: StoredBackupCode[] = plain.map((code) => ({ hash: sha256(code), usedAt: null }));
  return { plain, stored };
}

/** Returns the updated stored list, or null when the code is invalid/already used. */
export function consumeBackupCode(code: string, stored: StoredBackupCode[]): StoredBackupCode[] | null {
  const hash = sha256(code.trim().toUpperCase());
  let consumed = false;
  const next = stored.map((entry) => {
    if (!consumed && entry.hash === hash && !entry.usedAt) {
      consumed = true;
      return { ...entry, usedAt: new Date().toISOString() };
    }
    return entry;
  });
  return consumed ? next : null;
}
