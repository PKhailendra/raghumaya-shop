import { env } from '../config/env';

/**
 * Nodemailer custom transport that sends via the Gmail REST API over HTTPS.
 * Used when outbound SMTP ports are blocked (e.g. Railway free tier) but the
 * owner still wants mail sent from their own Gmail address via nodemailer.
 *
 * Required env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 * The refresh token needs the https://www.googleapis.com/auth/gmail.send scope.
 */

function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gmail OAuth token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Gmail OAuth returned no access token');
  return data.access_token;
}

export function isGmailApiConfigured(): boolean {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

type MailData = {
  from?: string | { address: string; name?: string };
  to?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
};

/** Build a minimal RFC2822 message from nodemailer's mail data. */
function buildRfc2822(data: MailData): string {
  const fromAddr =
    typeof data.from === 'string' ? data.from : data.from?.address ?? env.SMTP_FROM ?? env.SMTP_USER ?? '';
  const toAddrs = Array.isArray(data.to) ? data.to.join(', ') : (data.to ?? '');
  const lines = [
    `From: ${fromAddr}`,
    `To: ${toAddrs}`,
    `Subject: ${data.subject ?? ''}`,
    'MIME-Version: 1.0',
  ];
  if (data.html) {
    const boundary = `rmb_${Date.now().toString(36)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`);
    if (data.text) {
      lines.push('Content-Type: text/plain; charset=utf-8', '', data.text, `--${boundary}`);
    }
    lines.push('Content-Type: text/html; charset=utf-8', '', data.html, `--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8', '', data.text ?? '');
  }
  return lines.join('\r\n');
}

export function gmailApiTransport() {
  return {
    name: 'gmail-api',
    version: '1.0.0',
    send: (mail: { data: unknown; message: { getEnvelope: () => unknown } }, callback: (err: Error | null, info?: unknown) => void) => {
      (async () => {
        const accessToken = await getAccessToken();
        const raw = base64UrlEncode(buildRfc2822(mail.data as MailData));
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Gmail API send failed (${res.status}): ${body.slice(0, 300)}`);
        }
        const result = (await res.json()) as { id?: string };
        callback(null, {
          envelope: mail.message.getEnvelope(),
          messageId: result.id ?? '',
          response: `Gmail API: message ${result.id ?? 'sent'}`,
        });
      })().catch((err: Error) => callback(err));
    },
  };
}
