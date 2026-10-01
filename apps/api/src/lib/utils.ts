import { Prisma } from '@prisma/client';

/** Convert string|number input into a Prisma Decimal. */
export function D(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(String(value));
}

export const ZERO = new Prisma.Decimal(0);

export function round2(value: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

export function parseDate(value: string | Date | undefined | null, fallback?: Date): Date | undefined {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function getPagination(page = 1, limit = 20): Pagination {
  const p = Math.max(1, Math.floor(page));
  const l = Math.min(100, Math.max(1, Math.floor(limit)));
  return { page: p, limit: l, skip: (p - 1) * l, take: l };
}

export function pageMeta(total: number, page: number, limit: number) {
  return { page, limit, total };
}
