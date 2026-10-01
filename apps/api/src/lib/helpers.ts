import crypto from 'crypto';
import type { Request } from 'express';
import { getRedis } from './redis';

/**
 * Console SMS adapter (dev default). Every outbound SMS is persisted to
 * sms_logs and printed to stdout. Swap with a real provider (MSG91/Twilio)
 * by replacing sendSms in production.
 */
export interface SmsPayload {
  to: string;
  message: string;
  shopId?: string | null;
  invoiceId?: string | null;
  customerId?: string | null;
  notificationId?: string | null;
}

export async function sendSms(payload: SmsPayload): Promise<{ providerId: string }> {
  // eslint-disable-next-line no-console
  console.log(`[sms:${payload.to}] ${payload.message}`);
  return { providerId: `console-${Date.now()}` };
}

export async function queueSmsViaStore(payload: SmsPayload): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.rpush('sms:outbound', JSON.stringify(payload));
  } else {
    await sendSms(payload);
  }
}

export function deviceFingerprint(req: Request): { fingerprint: string; fields: Record<string, string | undefined> } {
  const fields: Record<string, string | undefined> = {
    deviceId: (req.get('x-device-id') ?? '').trim() || undefined,
    deviceName: req.get('x-device-name') ?? undefined,
    deviceType: req.get('x-device-type') ?? undefined,
    devicePlatform: req.get('x-device-platform') ?? undefined,
    deviceBrowser: req.get('x-device-browser') ?? undefined,
    userAgent: req.get('user-agent') ?? undefined,
    ip: req.ip,
  };
  const fingerprint = crypto
    .createHash('sha256')
    .update([fields.deviceId ?? '', fields.userAgent ?? '', fields.ip ?? ''].join('|'))
    .digest('hex');
  return { fingerprint, fields };
}

export function clientInfo(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
}

export function absoluteUrl(req: Request, path: string): string {
  const base = process.env.API_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
  return `${base}${path}`;
}

export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
