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

export function deviceFingerprint(req: Request): { fingerprint: string; fields: Record<string, string | undefined> } {  const fields: Record<string, string | undefined> = {
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

export interface ParsedDevice {
  /** Friendly display name, e.g. "Chrome on Windows" */
  name: string;
  /** desktop | mobile | tablet */
  type: string;
  /** OS platform, e.g. "Windows", "Android", "iOS" */
  platform: string;
  /** Browser name, e.g. "Chrome", "Safari" */
  browser: string;
}

/**
 * Parse a raw User-Agent string into friendly device info.
 * Used as a fallback when the client doesn't send x-device-* headers
 * (all web browsers), so the Security > Devices page shows real info
 * instead of "Unknown device".
 */
export function parseUserAgent(ua: string | undefined | null): ParsedDevice | null {
  if (!ua) return null;
  const u = ua.toLowerCase();

  // --- browser ---
  let browser = 'Unknown browser';
  if (u.includes('edg/') || u.includes('edge/')) browser = 'Edge';
  else if (u.includes('opr/') || u.includes('opera')) browser = 'Opera';
  else if (u.includes('samsungbrowser/')) browser = 'Samsung Internet';
  else if (u.includes('ucbrowser/')) browser = 'UC Browser';
  else if (u.includes('fxios/')) browser = 'Firefox iOS';
  else if (u.includes('crios/')) browser = 'Chrome iOS';
  else if (u.includes('firefox/')) browser = 'Firefox';
  else if (u.includes('chrome/')) browser = 'Chrome';
  else if (u.includes('safari/') && u.includes('version/')) browser = 'Safari';

  // --- platform ---
  let platform = 'Unknown OS';
  if (u.includes('windows nt 10') || u.includes('windows nt 11')) platform = 'Windows 10/11';
  else if (u.includes('windows')) platform = 'Windows';
  else if (u.includes('android')) platform = 'Android';
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ipod')) platform = 'iOS';
  else if (u.includes('mac os x') || u.includes('macintosh')) platform = 'macOS';
  else if (u.includes('linux')) platform = 'Linux';
  else if (u.includes('cros')) platform = 'ChromeOS';

  // --- type ---
  let type = 'desktop';
  if (u.includes('mobile') || u.includes('iphone') || u.includes('ipod') || u.includes('android')) type = 'mobile';
  if (u.includes('tablet') || u.includes('ipad')) type = 'tablet';
  // Android without "mobile" token is usually a tablet
  if (u.includes('android') && !u.includes('mobile')) type = 'tablet';

  // curl / bots / non-browser clients
  if (u.startsWith('curl/') || u.startsWith('wget/')) {
    return { name: 'API client (curl)', type: 'desktop', platform: 'Server', browser: 'curl' };
  }

  const name = browser === 'Unknown browser' && platform === 'Unknown OS' ? 'Unknown device' : `${browser} on ${platform}`;
  return { name, type, platform, browser };
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
