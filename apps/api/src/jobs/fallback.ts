/**
 * In-process fallback job runner for when Redis/BullMQ is unavailable.
 * Each registered job handler mirrors a BullMQ worker processor.
 */
import { prisma } from '../lib/prisma';
import { sendSms } from '../lib/helpers';
import { env } from '../config/env';

type Handler = (data: Record<string, unknown>) => Promise<void>;

const handlers: Record<string, Record<string, Handler>> = {
  sms: {
    send: async (data) => {
      const { to, message, shopId, customerId, invoiceId } = data as { to: string; message: string; shopId?: string; customerId?: string; invoiceId?: string };
      await sendSms({ to, message, shopId, customerId, invoiceId });
    },
  },
  notifications: {
    send: async (data) => {
      const { notificationId } = data as { notificationId: string };
      const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
      if (!notif || notif.sentAt) return;
      try {
        const payload = (notif.data ?? {}) as { channel?: string; phone?: string };
        if ((payload.channel === 'SMS' || payload.channel === 'WHATSAPP') && payload.phone) {
          await sendSms({ to: payload.phone, message: `${notif.title}\n${notif.body}`, shopId: notif.shopId ?? undefined });
        }
        await prisma.notification.update({ where: { id: notificationId }, data: { sentAt: new Date() } });
      } catch (err) {
        // leave sentAt null so the notification can be retried; record the failure
        await prisma.notification.update({
          where: { id: notificationId },
          data: { data: { ...((notif.data ?? {}) as object), lastError: (err as Error).message } as never },
        });
        throw err;
      }
    },
  },
  pdf: {
    generate: async (data) => {
      const { invoiceId } = data as { invoiceId: string };
      const { generatePdf } = await import('../modules/billing/billing.service');
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) return;
      // synthesize a worker context; generatePdf only needs shop scoping via the invoice
      const ctx = {
        actor: { actorType: 'admin' as const, adminId: 'system' },
        params: { shopId: invoice.shopId },
        ip: 'worker',
        userAgent: 'worker',
      };
      await generatePdf(ctx, invoiceId, invoice.shopId);
    },
  },
  reminders: {
    duePayment: async (data) => {
      const { shopId } = data as { shopId: string };
      const overdue = await prisma.invoice.findMany({
        where: { shopId, deletedAt: null, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { lt: new Date() }, customerId: { not: null } },
        include: { customer: { select: { id: true, name: true, phone: true } } },
        take: 500,
      });
      for (const inv of overdue) {
        if (!inv.customer?.phone) continue;
        const due = inv.totalAmount.sub(inv.paidAmount).toString();
        await sendSms({
          to: inv.customer.phone,
          message: `Reminder: invoice ${inv.invoiceNumber} for Rs.${due} is overdue. Please pay at the earliest.`,
          shopId,
          customerId: inv.customer.id,
          invoiceId: inv.id,
        });
        await prisma.customerReminder.create({
          data: { shopId, customerId: inv.customer.id, invoiceId: inv.id, channel: 'SMS', recipient: inv.customer.phone, message: `Auto reminder for invoice ${inv.invoiceNumber}`, status: 'SENT', sentAt: new Date() },
        });
      }
    },
  },
};

export async function runInline(queueName: string, jobName: string, data: Record<string, unknown>): Promise<void> {
  const handler = handlers[queueName]?.[jobName];
  if (!handler) {
    if (env.NODE_ENV === 'development') console.warn(`[jobs] no inline handler for ${queueName}/${jobName}`);
    return;
  }
  await handler(data);
}
