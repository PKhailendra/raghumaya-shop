import type { Request } from 'express';
import { prisma, type TxClient } from './prisma';
import type { Actor } from '@raghumaya/shared';

export type AuditSeverity = 'INFO' | 'MEDIUM' | 'HIGH';

export function defaultSeverity(action: string): AuditSeverity {
  const a = action.toUpperCase();
  if (/(FAILED|BLOCKED|DELETED|REMOVED|REJECTED|CANCELLED|DENIED)/.test(a)) return 'HIGH';
  if (/(PASSWORD|ROLE|PERMISSION|DEVICE|2FA|MFA|RECONCIL|SALARY)/.test(a)) return 'MEDIUM';
  return 'INFO';
}

export interface AuditInput {
  actor?: Actor;
  action: string;
  entityType: string;
  entityId?: string;
  shopId?: string | null;
  category?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  tx?: TxClient;
}

function toJson(value: unknown): object | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(
      JSON.stringify(value, (_k, v) =>
        v !== null && typeof v === 'object' && (v as { constructor?: { name?: string } }).constructor?.name === 'Decimal'
          ? (v as { toString(): string }).toString()
          : v,
      ),
    );
  } catch {
    return undefined;
  }
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const actorType = input.actor?.actorType ?? 'account';
  const actorId = input.actor?.actorType === 'admin' ? input.actor.adminId! : input.actor?.accountId ?? 'system';
  const db = input.tx ?? prisma;
  await db.auditLog.create({
    data: {
      actorType,
      actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      shopId: input.shopId ?? input.actor?.activeShopId ?? null,
      category: input.category ?? 'OPERATIONAL',
      severity: input.severity ?? defaultSeverity(input.action),
      metadata: toJson(input.metadata) as never,
      oldValue: toJson(input.oldValue) as never,
      newValue: toJson(input.newValue) as never,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

export function auditFromReq(req: Request): Pick<AuditInput, 'actor' | 'ipAddress' | 'userAgent'> {
  return {
    actor: (req as unknown as { actor?: Actor }).actor,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}
