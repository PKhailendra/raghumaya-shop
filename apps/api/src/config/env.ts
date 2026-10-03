import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  STORAGE_DIR: z.string().default('./storage'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Outgoing email (welcome credentials etc.). All optional — when unset,
  // email sending is skipped gracefully instead of failing the operation.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Resend HTTP API (preferred on hosts that block outbound SMTP, e.g. Railway).
  // Get a free key at https://resend.com — no credit card needed.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  // Gmail API over HTTPS (nodemailer custom transport) — works where SMTP
  // ports are blocked, sends from your own Gmail address.
  // 1. Create OAuth 2.0 credentials (Desktop app) at
  //    https://console.cloud.google.com/apis/credentials
  // 2. Get a refresh token at https://developers.google.com/oauthplayground
  //    using scope https://www.googleapis.com/auth/gmail.send
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
