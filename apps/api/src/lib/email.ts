import nodemailer from 'nodemailer';
import { env } from '../config/env';

/**
 * Outgoing email via SMTP (welcome credentials, etc.).
 * All SMTP settings are optional — when not configured, sending is skipped
 * gracefully (returns false) instead of failing the calling operation.
 */

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function transporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Fail fast instead of hanging the API request if SMTP is unreachable.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    // Extra safety: never let email sending block the caller more than 25s.
    const send = transporter().sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SMTP send timed out')), 25000),
    );
    await Promise.race([send, timeout]);
    return true;
  } catch (err) {
    // Never crash the caller because email failed — log and report.
    // eslint-disable-next-line no-console
    console.error('[email] send failed:', (err as Error).message);
    return false;
  }
}

/** Welcome email carrying the owner's login credentials after shop creation. */
export async function sendShopWelcomeEmail(input: {
  to: string;
  ownerName: string;
  shopName: string;
  loginId: string;
  phone: string;
  password: string;
  appUrl?: string;
}): Promise<boolean> {
  const { to, ownerName, shopName, loginId, phone, password, appUrl } = input;
  const loginLine = appUrl
    ? `<p>Open the app here: <a href="${appUrl}">${appUrl}</a></p>`
    : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      <h2 style="color: #166534;">Welcome to RaghuMayaShop, ${escapeHtml(ownerName)}!</h2>
      <p>Your shop <strong>${escapeHtml(shopName)}</strong> has been created. Use the login details below to sign in:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 12px; border: 1px solid #ddd; background: #f7f7f7;"><strong>Login ID</strong></td><td style="padding: 8px 12px; border: 1px solid #ddd;">${escapeHtml(loginId)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #ddd; background: #f7f7f7;"><strong>Phone</strong></td><td style="padding: 8px 12px; border: 1px solid #ddd;">${escapeHtml(phone)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #ddd; background: #f7f7f7;"><strong>Password</strong></td><td style="padding: 8px 12px; border: 1px solid #ddd;">${escapeHtml(password)}</td></tr>
      </table>
      ${loginLine}
      <p style="color: #555;">You can log in with your email ID or phone number. For your security, please change your password after your first login (Settings → Change password).</p>
      <p style="color: #888; font-size: 12px;">If you did not expect this email, please ignore it.</p>
    </div>`;
  const text =
    `Welcome to RaghuMayaShop, ${ownerName}!\n\n` +
    `Your shop "${shopName}" has been created.\n\n` +
    `Login ID: ${loginId}\nPhone: ${phone}\nPassword: ${password}\n\n` +
    `You can log in with your email ID or phone number. Please change your password after your first login.\n`;
  return sendEmail({ to, subject: `Your RaghuMayaShop login — ${shopName}`, html, text });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
