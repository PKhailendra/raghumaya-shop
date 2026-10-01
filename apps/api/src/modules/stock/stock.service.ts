import { Prisma, type StockMovementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, getPagination, pageMeta, parseDate } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import type { TxClient } from '../../lib/prisma';

/* ------------------------- ledger-first core ------------------------- */

export interface StockLine {
  productId: string;
  variantId?: string;
  batchId?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  quantity: string; // normalized string from zod
  unitCost?: string;
}

async function resolveBatch(
  tx: TxClient,
  shopId: string,
  line: StockLine,
): Promise<string | null> {
  if (line.batchId) {
    const b = await tx.productBatch.findFirst({ where: { id: line.batchId, shopId, deletedAt: null } });
    if (!b) throw new HttpError(404, 'BATCH_NOT_FOUND', 'Batch not found');
    return b.id;
  }
  if (line.batchNumber) {
    const existing = await tx.productBatch.findFirst({
      where: { shopId, productId: line.productId, variantId: line.variantId ?? null, batchNumber: line.batchNumber, deletedAt: null },
    });
    if (existing) return existing.id;
    const created = await tx.productBatch.create({
      data: {
        shopId,
        productId: line.productId,
        variantId: line.variantId ?? null,
        batchNumber: line.batchNumber,
        manufacturingDate: line.manufacturingDate ? new Date(line.manufacturingDate) : null,
        expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
        quantity: new Prisma.Decimal(0),
      },
    });
    return created.id;
  }
  return null;
}

async function upsertLevel(
  tx: TxClient,
  shopId: string,
  warehouseId: string,
  productId: string,
  variantId: string | null,
  batchId: string | null,
  delta: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const existing = await tx.stockLevel.findFirst({
    where: { shopId, warehouseId, productId, variantId, batchId, deletedAt: null },
  });
  if (existing) {
    const next = existing.quantity.add(delta);
    if (next.isNegative()) {
      throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock for this operation');
    }
    await tx.stockLevel.update({ where: { id: existing.id }, data: { quantity: next } });
    return next;
  }
  if (delta.isNegative()) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock for this operation');
  await tx.stockLevel.create({ data: { shopId, warehouseId, productId, variantId, batchId, quantity: delta } });
  return delta;
}

/** Recalculate product/variant/batch totals from the immutable movement ledger. */
export async function recalculateTotals(tx: TxClient, shopId: string, productId: string, variantId?: string | null): Promise<void> {
  const movements = await tx.stockMovement.findMany({
    where: { shopId, productId, ...(variantId !== undefined ? { variantId } : {}), deletedAt: null },
    select: { type: true, quantity: true, variantId: true, batchId: true },
  });
  const sign = (t: StockMovementType): number =>
    t === 'IN' || t === 'PURCHASE' ? 1 : t === 'OUT' || t === 'SALE' ? -1 : 0;

  if (variantId) {
    // variant-level + batch-level recalculation
    let variantQty = new Prisma.Decimal(0);
    const batchTotals = new Map<string, Prisma.Decimal>();
    for (const m of movements) {
      const s = m.type === 'TRANSFER' ? 0 : sign(m.type);
      // TRANSFER rows are stored in matched pairs; recompute from levels instead
      if (s === 0) continue;
      variantQty = variantQty.add(m.quantity.mul(s));
      if (m.batchId) batchTotals.set(m.batchId, (batchTotals.get(m.batchId) ?? new Prisma.Decimal(0)).add(m.quantity.mul(s)));
    }
    // incorporate transfer pairs via levels (source of truth for transfers)
    const levels = await tx.stockLevel.findMany({ where: { shopId, productId, variantId, deletedAt: null } });
    let fromLevels = new Prisma.Decimal(0);
    for (const l of levels) fromLevels = fromLevels.add(l.quantity);
    const batchIds = await tx.productBatch.findMany({ where: { shopId, productId, variantId, deletedAt: null }, select: { id: true } });
    for (const b of batchIds) {
      const bLevels = await tx.stockLevel.findMany({ where: { shopId, productId, variantId, batchId: b.id, deletedAt: null } });
      let q = new Prisma.Decimal(0);
      for (const l of bLevels) q = q.add(l.quantity);
      await tx.productBatch.update({ where: { id: b.id }, data: { quantity: q } });
    }
    await tx.productVariant.update({ where: { id: variantId }, data: { currentStock: fromLevels } });
  } else {
    const levels = await tx.stockLevel.findMany({ where: { shopId, productId, deletedAt: null } });
    let total = new Prisma.Decimal(0);
    for (const l of levels) total = total.add(l.quantity);
    await tx.product.update({ where: { id: productId }, data: { currentStock: total } });
    // batch totals without variant
    const batches = await tx.productBatch.findMany({ where: { shopId, productId, variantId: null, deletedAt: null }, select: { id: true } });
    for (const b of batches) {
      const bLevels = await tx.stockLevel.findMany({ where: { shopId, productId, batchId: b.id, deletedAt: null } });
      let q = new Prisma.Decimal(0);
      for (const l of bLevels) q = q.add(l.quantity);
      await tx.productBatch.update({ where: { id: b.id }, data: { quantity: q } });
    }
  }
}

export interface MovementInput extends StockLine {
  warehouseId: string;
  type: StockMovementType;
  referenceType: string;
  referenceId?: string;
  notes?: string;
}

/** Ledger-first stock application: movements -> levels -> product totals. */
export async function applyStockMovements(
  tx: TxClient,
  shopId: string,
  createdById: string | undefined,
  lines: MovementInput[],
): Promise<void> {
  for (const line of lines) {
    const qty = D(line.quantity);
    if (qty.lte(0)) throw new HttpError(400, 'INVALID_QUANTITY', 'Quantity must be positive');
    const product = await tx.product.findFirst({ where: { id: line.productId, shopId, deletedAt: null } });
    if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', `Product not found: ${line.productId}`);
    if (line.variantId) {
      const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, productId: line.productId, deletedAt: null } });
      if (!variant) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Product variant not found');
    }
    const batchId = await resolveBatch(tx, shopId, line);
    const variantId = line.variantId ?? null;
    const isOut = line.type === 'OUT' || line.type === 'SALE';
    const delta = isOut ? qty.neg() : qty;

    await tx.stockMovement.create({
      data: {
        shopId,
        warehouseId: line.warehouseId,
        productId: line.productId,
        variantId,
        batchId,
        type: line.type,
        quantity: qty,
        unitCost: line.unitCost ? D(line.unitCost) : null,
        referenceType: line.referenceType,
        referenceId: line.referenceId,
        notes: line.notes,
        createdById,
      },
    });
    await upsertLevel(tx, shopId, line.warehouseId, line.productId, variantId, batchId, delta);
    await recalculateTotals(tx, shopId, line.productId, variantId || undefined);
  }
}

async function defaultWarehouse(tx: TxClient, shopId: string): Promise<string> {
  const w = await tx.warehouse.findFirst({ where: { shopId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  if (!w) throw new HttpError(400, 'NO_WAREHOUSE', 'No warehouse found for this shop');
  return w.id;
}

async function assertWarehouse(tx: TxClient, shopId: string, id: string) {
  const w = await tx.warehouse.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!w) throw new HttpError(404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found');
  return w;
}

/* ------------------------------ warehouses ------------------------------ */

export async function createWarehouse(ctx: ReqCtx, input: { name: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean }) {
  const shopId = requireShopId(ctx);
  const warehouse = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.warehouse.updateMany({ where: { shopId }, data: { isDefault: false } });
    return tx.warehouse.create({ data: { shopId, name: input.name, code: input.code, address: input.address, isDefault: input.isDefault ?? false, isActive: input.isActive ?? true } });
  });
  await writeAudit({ ...ctx, action: 'WAREHOUSE_CREATED', entityType: 'warehouse', entityId: warehouse.id, shopId, newValue: warehouse });
  return warehouse;
}

export async function listWarehouses(ctx: ReqCtx) {
  const shopId = requireShopId(ctx);
  return prisma.warehouse.findMany({ where: { shopId, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
}

export async function updateWarehouse(ctx: ReqCtx, id: string, input: { name?: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean }) {
  const shopId = requireShopId(ctx);
  const before = await prisma.warehouse.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found');
  const after = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.warehouse.updateMany({ where: { shopId, id: { not: id } }, data: { isDefault: false } });
    return tx.warehouse.update({ where: { id }, data: input });
  });
  await writeAudit({ ...ctx, action: 'WAREHOUSE_UPDATED', entityType: 'warehouse', entityId: id, shopId, oldValue: before, newValue: after });
  return after;
}

export async function deleteWarehouse(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const warehouse = await prisma.warehouse.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!warehouse) throw new HttpError(404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found');
  const levelCount = await prisma.stockLevel.count({ where: { warehouseId: id, deletedAt: null, quantity: { gt: 0 } } });
  if (levelCount > 0) throw new HttpError(409, 'WAREHOUSE_IN_USE', 'Warehouse still holds stock and cannot be deleted');
  await prisma.warehouse.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await writeAudit({ ...ctx, action: 'WAREHOUSE_DELETED', entityType: 'warehouse', entityId: id, shopId, severity: 'HIGH' });
  return { deleted: true };
}

/* --------------------------- stock operations --------------------------- */

export async function stockIn(ctx: ReqCtx, input: { warehouseId: string; referenceType: string; referenceId?: string; notes?: string; items: StockLine[] }) {
  const shopId = requireShopId(ctx);
  await prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, shopId, input.warehouseId);
    await applyStockMovements(tx, shopId, ctx.actor.accountId, input.items.map((i) => ({
      ...i, warehouseId: input.warehouseId, type: 'IN' as StockMovementType, referenceType: input.referenceType, referenceId: input.referenceId, notes: input.notes,
    })));
  });
  await writeAudit({ ...ctx, action: 'STOCK_IN', entityType: 'stock', shopId, metadata: { warehouseId: input.warehouseId, lines: input.items.length } });
  return { moved: input.items.length };
}

export async function stockOut(ctx: ReqCtx, input: { warehouseId: string; referenceType: string; referenceId?: string; notes?: string; items: StockLine[] }) {
  const shopId = requireShopId(ctx);
  await prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, shopId, input.warehouseId);
    await applyStockMovements(tx, shopId, ctx.actor.accountId, input.items.map((i) => ({
      ...i, warehouseId: input.warehouseId, type: 'OUT' as StockMovementType, referenceType: input.referenceType, referenceId: input.referenceId, notes: input.notes,
    })));
  });
  await writeAudit({ ...ctx, action: 'STOCK_OUT', entityType: 'stock', shopId, metadata: { warehouseId: input.warehouseId, lines: input.items.length } });
  return { moved: input.items.length };
}

export async function stockTransfer(
  ctx: ReqCtx,
  input: { fromWarehouseId: string; toWarehouseId: string; notes?: string; items: Array<{ productId: string; variantId?: string; batchId?: string; quantity: string }> },
) {
  const shopId = requireShopId(ctx);
  const transfer = await prisma.$transaction(async (tx) => {
    await assertWarehouse(tx, shopId, input.fromWarehouseId);
    await assertWarehouse(tx, shopId, input.toWarehouseId);
    const count = await tx.stockTransfer.count({ where: { shopId } });
    const header = await tx.stockTransfer.create({
      data: {
        shopId,
        transferNumber: `TRF-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        status: 'COMPLETED',
        notes: input.notes,
        createdById: ctx.actor.accountId,
      },
    });
    for (const item of input.items) {
      const qty = D(item.quantity);
      if (qty.lte(0)) throw new HttpError(400, 'INVALID_QUANTITY', 'Quantity must be positive');
      const variantId = item.variantId ?? null;
      const batchId = item.batchId ?? null;
      // OUT from source (insufficient-stock guard inside upsertLevel)
      await tx.stockMovement.create({
        data: { shopId, warehouseId: input.fromWarehouseId, productId: item.productId, variantId, batchId, type: 'TRANSFER', quantity: qty, referenceType: 'TRANSFER', referenceId: header.id, notes: input.notes, createdById: ctx.actor.accountId },
      });
      await upsertLevel(tx, shopId, input.fromWarehouseId, item.productId, variantId, batchId, qty.neg());
      // IN to destination
      await tx.stockMovement.create({
        data: { shopId, warehouseId: input.toWarehouseId, productId: item.productId, variantId, batchId, type: 'TRANSFER', quantity: qty, referenceType: 'TRANSFER', referenceId: header.id, notes: input.notes, createdById: ctx.actor.accountId },
      });
      await upsertLevel(tx, shopId, input.toWarehouseId, item.productId, variantId, batchId, qty);
      await tx.stockTransferItem.create({ data: { transferId: header.id, productId: item.productId, variantId, batchId, quantity: qty } });
      await recalculateTotals(tx, shopId, item.productId, variantId || undefined);
    }
    return header;
  });
  await writeAudit({ ...ctx, action: 'STOCK_TRANSFER', entityType: 'stock_transfer', entityId: transfer.id, shopId, newValue: transfer });
  return transfer;
}

export async function purchaseUpdate(ctx: ReqCtx, input: { warehouseId?: string; referenceId?: string; notes?: string; items: StockLine[] }) {
  const shopId = requireShopId(ctx);
  await prisma.$transaction(async (tx) => {
    const warehouseId = input.warehouseId ?? (await defaultWarehouse(tx, shopId));
    await assertWarehouse(tx, shopId, warehouseId);
    await applyStockMovements(tx, shopId, ctx.actor.accountId, input.items.map((i) => ({
      ...i, warehouseId, type: 'PURCHASE' as StockMovementType, referenceType: 'PURCHASE', referenceId: input.referenceId, notes: input.notes,
    })));
  });
  await writeAudit({ ...ctx, action: 'STOCK_PURCHASE_UPDATE', entityType: 'stock', shopId, metadata: { lines: input.items.length } });
  return { moved: input.items.length };
}

export async function salesDeduction(ctx: ReqCtx, input: { warehouseId?: string; referenceId?: string; notes?: string; items: StockLine[] }) {
  const shopId = requireShopId(ctx);
  await prisma.$transaction(async (tx) => {
    const warehouseId = input.warehouseId ?? (await defaultWarehouse(tx, shopId));
    await assertWarehouse(tx, shopId, warehouseId);
    await applyStockMovements(tx, shopId, ctx.actor.accountId, input.items.map((i) => ({
      ...i, warehouseId, type: 'SALE' as StockMovementType, referenceType: 'SALE', referenceId: input.referenceId, notes: input.notes,
    })));
  });
  await writeAudit({ ...ctx, action: 'STOCK_SALES_DEDUCTION', entityType: 'stock', shopId, metadata: { lines: input.items.length } });
  return { moved: input.items.length };
}

/* -------------------------------- reads -------------------------------- */

export async function listLevels(ctx: ReqCtx, query: { page: number; limit: number; warehouseId?: string; productId?: string; search?: string }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.StockLevelWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search
      ? {
          product: {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [data, total] = await Promise.all([
    prisma.stockLevel.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, reorderLevel: true } },
      },
    }),
    prisma.stockLevel.count({ where }),
  ]);
  return { data, meta: pageMeta(total, query.page, query.limit) };
}

export async function listMovements(ctx: ReqCtx, query: { page: number; limit: number; productId?: string; warehouseId?: string; type?: StockMovementType; fromDate?: string; toDate?: string }) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.StockMovementWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.fromDate || query.toDate
      ? { createdAt: { ...(query.fromDate ? { gte: parseDate(query.fromDate)! } : {}), ...(query.toDate ? { lte: parseDate(query.toDate)! } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.stockMovement.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function lowStockAlerts(ctx: ReqCtx, page = 1, limit = 20) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(page, limit);
  const products = await prisma.product.findMany({ where: { shopId, deletedAt: null, isActive: true }, select: { id: true, name: true, sku: true, unit: true, currentStock: true, reorderLevel: true } });
  const alerts = products
    .filter((p) => p.currentStock.lte(p.reorderLevel) && p.currentStock.gt(0))
    .map((p) => ({ productId: p.id, name: p.name, sku: p.sku, unit: p.unit, currentStock: p.currentStock.toString(), reorderLevel: p.reorderLevel.toString(), alert: 'LOW_STOCK' as const }));
  return { data: alerts.slice(skip, skip + take), meta: pageMeta(alerts.length, page, limit) };
}

export async function outOfStockAlerts(ctx: ReqCtx, page = 1, limit = 20) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(page, limit);
  const products = await prisma.product.findMany({ where: { shopId, deletedAt: null, isActive: true, currentStock: { lte: 0 } }, select: { id: true, name: true, sku: true, unit: true, currentStock: true, reorderLevel: true } });
  const alerts = products.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, unit: p.unit, currentStock: p.currentStock.toString(), reorderLevel: p.reorderLevel.toString(), alert: 'OUT_OF_STOCK' as const }));
  return { data: alerts.slice(skip, skip + take), meta: pageMeta(alerts.length, page, limit) };
}

export async function expiryAlerts(ctx: ReqCtx, days = 30, page = 1, limit = 20) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(page, limit);
  const cutoff = new Date(Date.now() + days * 24 * 3600 * 1000);
  const where: Prisma.ProductBatchWhereInput = { shopId, deletedAt: null, expiryDate: { lte: cutoff }, quantity: { gt: 0 } };
  const [rows, total] = await Promise.all([
    prisma.productBatch.findMany({ where, skip, take, orderBy: { expiryDate: 'asc' }, include: { product: { select: { id: true, name: true, sku: true } } } }),
    prisma.productBatch.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, page, limit) };
}

export async function recalculate(ctx: ReqCtx, productId?: string) {
  const shopId = requireShopId(ctx);
  const products = await prisma.product.findMany({ where: { shopId, deletedAt: null, ...(productId ? { id: productId } : {}) }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const p of products) {
      await recalculateTotals(tx, shopId, p.id);
      const variants = await tx.productVariant.findMany({ where: { productId: p.id, deletedAt: null }, select: { id: true } });
      for (const v of variants) await recalculateTotals(tx, shopId, p.id, v.id);
    }
  });
  await writeAudit({ ...ctx, action: 'STOCK_RECALCULATED', entityType: 'stock', shopId, metadata: { products: products.length } });
  return { recalculated: products.length };
}
