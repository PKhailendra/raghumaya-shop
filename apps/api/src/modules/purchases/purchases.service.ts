import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, getPagination, pageMeta, parseDate, round2 } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import { applyStockMovements, type StockLine } from '../stock/stock.service';

interface PurchaseItemInput {
  productId: string;
  variantId?: string;
  batchNumber?: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

export async function createPurchase(
  ctx: ReqCtx,
  input: { supplierId?: string; purchaseNumber?: string; purchaseDate?: string; warehouseId?: string; notes?: string; items: PurchaseItemInput[] },
) {
  const shopId = requireShopId(ctx);
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, shopId, deletedAt: null } });
    if (!supplier) throw new HttpError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found');
  }

  const purchase = await prisma.$transaction(async (tx) => {
    let purchaseNumber = input.purchaseNumber;
    if (!purchaseNumber) {
      const count = await tx.purchase.count({ where: { shopId } });
      purchaseNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    } else {
      const dup = await tx.purchase.findFirst({ where: { shopId, purchaseNumber, deletedAt: null } });
      if (dup) throw new HttpError(409, 'PURCHASE_NUMBER_EXISTS', 'Purchase number already exists');
    }

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    const lines = input.items.map((item) => {
      const qty = D(item.quantity);
      const cost = D(item.unitCost);
      const lineSubtotal = qty.mul(cost);
      const tax = lineSubtotal.mul(D(item.taxRate)).div(100);
      const lineTotal = round2(lineSubtotal.add(tax));
      subtotal = subtotal.add(lineSubtotal);
      taxTotal = taxTotal.add(tax);
      return { ...item, lineTotal };
    });
    const totalAmount = round2(subtotal.add(taxTotal));

    const created = await tx.purchase.create({
      data: {
        shopId,
        supplierId: input.supplierId,
        purchaseNumber,
        purchaseDate: parseDate(input.purchaseDate) ?? new Date(),
        status: 'RECEIVED',
        subtotal: round2(subtotal),
        taxTotal: round2(taxTotal),
        totalAmount,
        notes: input.notes,
        createdById: ctx.actor.accountId,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            batchNumber: l.batchNumber,
            quantity: D(l.quantity),
            unitCost: D(l.unitCost),
            taxRate: D(l.taxRate),
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { items: true, supplier: { select: { id: true, name: true } } },
    });

    // auto stock-in (ledger-first)
    const warehouse = input.warehouseId
      ? await tx.warehouse.findFirst({ where: { id: input.warehouseId, shopId, deletedAt: null } })
      : await tx.warehouse.findFirst({ where: { shopId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!warehouse) throw new HttpError(400, 'NO_WAREHOUSE', 'No warehouse available for stock-in');
    const stockLines: Array<StockLine & { warehouseId: string; type: 'PURCHASE'; referenceType: string; referenceId: string }> = lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      batchNumber: l.batchNumber,
      quantity: l.quantity,
      unitCost: l.unitCost,
      warehouseId: warehouse.id,
      type: 'PURCHASE',
      referenceType: 'PURCHASE',
      referenceId: created.id,
    }));
    await applyStockMovements(tx, shopId, ctx.actor.accountId, stockLines);
    return created;
  });

  await writeAudit({ ...ctx, action: 'PURCHASE_CREATED', entityType: 'purchase', entityId: purchase.id, shopId, newValue: { purchaseNumber: purchase.purchaseNumber, totalAmount: purchase.totalAmount.toString() } });
  return purchase;
}

export async function listPurchases(ctx: ReqCtx, query: { page: number; limit: number; search?: string; supplierId?: string; fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.PurchaseWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.search ? { OR: [{ purchaseNumber: { contains: query.search, mode: 'insensitive' } }, { notes: { contains: query.search, mode: 'insensitive' } }] } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.fromDate || query.toDate ? { purchaseDate: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.purchase.findMany({ where, skip, take, orderBy: { purchaseDate: 'desc' }, include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } } }),
    prisma.purchase.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function getPurchase(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const purchase = await prisma.purchase.findFirst({
    where: { id, shopId, deletedAt: null },
    include: { items: true, supplier: true },
  });
  if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
  return purchase;
}

export async function updatePurchase(
  ctx: ReqCtx,
  id: string,
  input: { supplierId?: string | null; purchaseDate?: string; notes?: string | null; status?: 'DRAFT' | 'RECEIVED' | 'CANCELLED' },
) {
  const shopId = requireShopId(ctx);
  const before = await prisma.purchase.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, shopId, deletedAt: null } });
    if (!supplier) throw new HttpError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found');
  }
  const after = await prisma.purchase.update({
    where: { id },
    data: {
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.purchaseDate ? { purchaseDate: parseDate(input.purchaseDate)! } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: { items: true },
  });
  await writeAudit({ ...ctx, action: 'PURCHASE_UPDATED', entityType: 'purchase', entityId: id, shopId, oldValue: before, newValue: after });
  return after;
}
