import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { getPagination, pageMeta } from '../../lib/utils';
import { enqueue } from '../../lib/queue';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { optionalShopId } from '../ctx';

type NotificationType = 'INFO' | 'WARNING' | 'ALERT' | 'SYSTEM';

export async function listNotifications(
  ctx: ReqCtx,
  query: { page: number; limit: number; type?: NotificationType; unreadOnly?: boolean },
) {
  const shopId = optionalShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.NotificationWhereInput = {
    ...(shopId ? { shopId } : {}),
    deletedAt: null,
    ...(query.type ? { type: query.type } : {}),
    ...(query.unreadOnly ? { readAt: null } : {}),
  };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...(shopId ? { shopId } : {}), deletedAt: null, readAt: null } }),
  ]);
  return { data: rows, meta: { ...pageMeta(total, query.page, query.limit), unread } };
}

export async function markRead(ctx: ReqCtx, id: string) {
  const shopId = optionalShopId(ctx);
  const notif = await prisma.notification.findFirst({ where: { id, ...(shopId ? { shopId } : {}), deletedAt: null } });
  if (!notif) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  const updated = await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  await writeAudit({ ...ctx, action: 'NOTIFICATION_READ', entityType: 'notification', entityId: id, shopId: shopId ?? undefined });
  return updated;
}

export async function markAllRead(ctx: ReqCtx) {
  const shopId = optionalShopId(ctx);
  const result = await prisma.notification.updateMany({ where: { ...(shopId ? { shopId } : {}), deletedAt: null, readAt: null }, data: { readAt: new Date() } });
  if (result.count > 0) {
    await writeAudit({ ...ctx, action: 'NOTIFICATIONS_READ_ALL', entityType: 'notification', shopId: shopId ?? undefined, newValue: { marked: result.count } });
  }
  return { marked: result.count };
}

/** Re-dispatch a notification's delivery (e.g. its SMS/WhatsApp send failed). */
export async function retryNotification(ctx: ReqCtx, id: string) {
  const shopId = optionalShopId(ctx);
  const notif = await prisma.notification.findFirst({ where: { id, ...(shopId ? { shopId } : {}), deletedAt: null } });
  if (!notif) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  const data = (notif.data ?? {}) as Record<string, unknown>;
  if (!data.phone || !data.channel || (data.channel !== 'SMS' && data.channel !== 'WHATSAPP')) {
    throw new HttpError(409, 'NOTIFICATION_NOT_RETRYABLE', 'This notification has no external delivery to retry');
  }
  await prisma.notification.update({ where: { id }, data: { sentAt: null } });
  await enqueue('notifications', 'send', { notificationId: id, shopId: shopId ?? notif.shopId });
  await writeAudit({ ...ctx, action: 'NOTIFICATION_RETRIED', entityType: 'notification', entityId: id, shopId: shopId ?? undefined });
  return { queued: true };
}

/**
 * Create a notification row (used by services). When an external channel is
 * requested, the phone + channel are stored in `data` and delivery is queued.
 */
export async function createNotification(input: {
  shopId: string;
  accountId?: string;
  adminId?: string;
  title: string;
  body: string;
  type?: NotificationType;
  channel?: 'SMS' | 'WHATSAPP';
  phone?: string;
  data?: Record<string, unknown>;
}) {
  const notif = await prisma.notification.create({
    data: {
      shopId: input.shopId,
      recipientType: input.adminId ? 'admin' : input.accountId ? 'account' : null,
      recipientId: input.adminId ?? input.accountId ?? null,
      title: input.title,
      body: input.body,
      type: input.type ?? 'INFO',
      data: { ...(input.data ?? {}), ...(input.channel ? { channel: input.channel, phone: input.phone } : {}) } as Prisma.InputJsonValue,
    },
  });
  if (input.channel && input.phone) {
    await enqueue('notifications', 'send', { notificationId: notif.id, shopId: input.shopId });
  }
  // internal/system-originated write: actor defaults to 'system' in writeAudit
  await writeAudit({ action: 'NOTIFICATION_CREATED', entityType: 'notification', entityId: notif.id, shopId: input.shopId, newValue: { title: input.title, type: input.type ?? 'INFO' } });
  return notif;
}
