import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import { D, getPagination, pageMeta } from '../../lib/utils';
import { HttpError } from '../../middleware/errorHandler';
import type { ReqCtx } from '../ctx';
import { requireShopId } from '../ctx';
import type { ProductCreateInput } from '@raghumaya/shared';

const productInclude = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' as const } },
  variants: { where: { deletedAt: null } },
  batches: { where: { deletedAt: null }, orderBy: { expiryDate: 'asc' as const } },
};

/* ------------------------------ categories ------------------------------ */

export async function createCategory(ctx: ReqCtx, input: { name: string; parentId?: string | null; description?: string; imageUrl?: string }) {
  const shopId = requireShopId(ctx);
  if (input.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: input.parentId, shopId, deletedAt: null } });
    if (!parent) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Parent category not found');
  }
  try {
    const category = await prisma.category.create({ data: { shopId, name: input.name, parentId: input.parentId ?? null, description: input.description, imageUrl: input.imageUrl } });
    await writeAudit({ ...ctx, action: 'CATEGORY_CREATED', entityType: 'category', entityId: category.id, shopId, newValue: category });
    return category;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'CATEGORY_EXISTS', 'A category with this name already exists');
    }
    throw e;
  }
}

export async function listCategories(ctx: ReqCtx, page = 1, limit = 100, search?: string, parentId?: string) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(page, Math.min(limit, 100));
  const where: Prisma.CategoryWhereInput = {
    shopId,
    deletedAt: null,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...(parentId ? { parentId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.category.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: { _count: { select: { products: { where: { deletedAt: null } } } } } }),
    prisma.category.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, page, limit) };
}

export async function updateCategory(ctx: ReqCtx, id: string, input: { name?: string; parentId?: string | null; description?: string; imageUrl?: string }) {
  const shopId = requireShopId(ctx);
  const before = await prisma.category.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  const after = await prisma.category.update({ where: { id }, data: { ...input } });
  await writeAudit({ ...ctx, action: 'CATEGORY_UPDATED', entityType: 'category', entityId: id, shopId, oldValue: before, newValue: after });
  return after;
}

export async function deleteCategory(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const category = await prisma.category.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  const productCount = await prisma.product.count({ where: { categoryId: id, deletedAt: null } });
  if (productCount > 0) throw new HttpError(409, 'CATEGORY_IN_USE', 'Category has products and cannot be deleted');
  await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ ...ctx, action: 'CATEGORY_DELETED', entityType: 'category', entityId: id, shopId, severity: 'HIGH' });
  return { deleted: true };
}

/* ------------------------------- brands -------------------------------- */

export async function createBrand(ctx: ReqCtx, input: { name: string; description?: string; logoUrl?: string }) {
  const shopId = requireShopId(ctx);
  try {
    const brand = await prisma.brand.create({ data: { shopId, ...input } });
    await writeAudit({ ...ctx, action: 'BRAND_CREATED', entityType: 'brand', entityId: brand.id, shopId, newValue: brand });
    return brand;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'BRAND_EXISTS', 'A brand with this name already exists');
    }
    throw e;
  }
}

export async function listBrands(ctx: ReqCtx, page = 1, limit = 100, search?: string) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(page, Math.min(limit, 100));
  const where: Prisma.BrandWhereInput = {
    shopId,
    deletedAt: null,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.brand.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
    prisma.brand.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(total, page, limit) };
}

/* ------------------------------ products ------------------------------ */

function uniqueError(e: unknown, entity: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
    throw new HttpError(409, `${entity}_DUPLICATE`, `Duplicate value for ${target}`);
  }
  throw e;
}

export async function createProduct(ctx: ReqCtx, input: ProductCreateInput) {
  const shopId = requireShopId(ctx);
  if (input.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: input.categoryId, shopId, deletedAt: null } });
    if (!cat) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
  if (input.brandId) {
    const brand = await prisma.brand.findFirst({ where: { id: input.brandId, shopId, deletedAt: null } });
    if (!brand) throw new HttpError(404, 'BRAND_NOT_FOUND', 'Brand not found');
  }
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          shopId,
          categoryId: input.categoryId,
          brandId: input.brandId,
          name: input.name,
          sku: input.sku || null,
          barcode: input.barcode || null,
          qrCode: input.qrCode || null,
          description: input.description,
          unit: input.unit ?? 'pcs',
          purchasePrice: D(input.purchasePrice),
          sellingPrice: D(input.sellingPrice),
          mrp: input.mrp ? D(input.mrp) : null,
          taxRate: D(input.taxRate ?? 0),
          hsnCode: input.hsnCode,
          currentStock: D(input.currentStock ?? 0),
          reorderLevel: D(input.reorderLevel ?? 0),
          isActive: input.isActive ?? true,
        },
      });
      if (input.images?.length) {
        await tx.productImage.createMany({
          data: input.images.map((img) => ({ productId: created.id, url: img.url, isPrimary: img.isPrimary ?? false, sortOrder: img.sortOrder ?? 0 })),
        });
      }
      for (const v of input.variants ?? []) {
        const variant = await tx.productVariant.create({
          data: {
            productId: created.id,
            name: v.name,
            sku: v.sku || null,
            barcode: v.barcode || null,
            qrCode: v.qrCode || null,
            attributes: (v.attributes ?? undefined) as never,
            purchasePrice: v.purchasePrice ? D(v.purchasePrice) : null,
            sellingPrice: v.sellingPrice ? D(v.sellingPrice) : null,
            currentStock: D(v.currentStock ?? 0),
            reorderLevel: D(v.reorderLevel ?? 0),
          },
        });
        const vOpening = D(v.currentStock ?? 0);
        if (vOpening.gt(0)) {
          const warehouse = await tx.warehouse.findFirst({
            where: { shopId, deletedAt: null },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          });
          if (!warehouse) throw new HttpError(400, 'NO_WAREHOUSE', 'Create a warehouse before adding opening stock');
          await tx.stockMovement.create({
            data: {
              shopId,
              warehouseId: warehouse.id,
              productId: created.id,
              variantId: variant.id,
              type: 'IN',
              quantity: vOpening,
              unitCost: v.purchasePrice ? D(v.purchasePrice) : D(input.purchasePrice),
              referenceType: 'MANUAL',
              notes: `Opening stock (${v.name})`,
              createdById: ctx.actor.accountId ?? ctx.actor.adminId ?? null,
            },
          });
          await tx.stockLevel.create({
            data: { shopId, warehouseId: warehouse.id, productId: created.id, variantId: variant.id, quantity: vOpening },
          });
        }
      }
      for (const b of input.batches ?? []) {
        await tx.productBatch.create({
          data: {
            shopId,
            productId: created.id,
            batchNumber: b.batchNumber,
            manufacturingDate: b.manufacturingDate ? new Date(b.manufacturingDate) : null,
            expiryDate: b.expiryDate ? new Date(b.expiryDate) : null,
            quantity: D(b.quantity ?? 0),
            purchasePrice: b.purchasePrice ? D(b.purchasePrice) : null,
            sellingPrice: b.sellingPrice ? D(b.sellingPrice) : null,
          },
        });
      }
      // Ledger-first: opening stock is never written to the product row alone —
      // it is posted as an IN movement plus a stock-level row.
      const opening = D(input.currentStock ?? 0);
      if (opening.gt(0)) {
        const warehouse = await tx.warehouse.findFirst({
          where: { shopId, deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
        if (!warehouse) throw new HttpError(400, 'NO_WAREHOUSE', 'Create a warehouse before adding opening stock');
        await tx.stockMovement.create({
          data: {
            shopId,
            warehouseId: warehouse.id,
            productId: created.id,
            type: 'IN',
            quantity: opening,
            unitCost: D(input.purchasePrice),
            referenceType: 'MANUAL',
            notes: 'Opening stock',
            createdById: ctx.actor.accountId ?? ctx.actor.adminId ?? null,
          },
        });
        await tx.stockLevel.create({
          data: { shopId, warehouseId: warehouse.id, productId: created.id, quantity: opening },
        });
      }
      return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productInclude });
    });
    await writeAudit({ ...ctx, action: 'PRODUCT_CREATED', entityType: 'product', entityId: product.id, shopId, newValue: { name: product.name, sku: product.sku } });
    return product;
  } catch (e) {
    return uniqueError(e, 'PRODUCT');
  }
}

export async function listProducts(
  ctx: ReqCtx,
  query: { page: number; limit: number; search?: string; categoryId?: string; brandId?: string; isActive?: boolean; lowStock?: boolean; sortBy: string; sortOrder: 'asc' | 'desc' },
) {
  const shopId = requireShopId(ctx);
  const { skip, take } = getPagination(query.page, query.limit);
  const where: Prisma.ProductWhereInput = {
    shopId,
    deletedAt: null,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { sku: { contains: query.search, mode: 'insensitive' } }, { barcode: query.search }] }
      : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sortBy === 'name' ? { name: query.sortOrder } : query.sortBy === 'sellingPrice' ? { sellingPrice: query.sortOrder } : query.sortBy === 'currentStock' ? { currentStock: query.sortOrder } : { createdAt: query.sortOrder };

  let rows = await prisma.product.findMany({ where, skip, take, orderBy, include: productInclude });
  let total = await prisma.product.count({ where });
  if (query.lowStock) {
    // low stock: currentStock <= reorderLevel (computed in JS to avoid raw SQL portability issues)
    rows = rows.filter((p) => p.currentStock.lte(p.reorderLevel));
    const all = await prisma.product.findMany({ where, select: { currentStock: true, reorderLevel: true } });
    total = all.filter((p) => p.currentStock.lte(p.reorderLevel)).length;
  }
  return { data: rows, meta: pageMeta(total, query.page, query.limit) };
}

export async function lookupProduct(ctx: ReqCtx, type: 'barcode' | 'qr', code: string) {
  const shopId = requireShopId(ctx);
  const where: Prisma.ProductWhereInput =
    type === 'barcode' ? { shopId, barcode: code, deletedAt: null } : { shopId, qrCode: code, deletedAt: null };
  const product = await prisma.product.findFirst({ where, include: productInclude });
  if (!product) {
    // also check variants
    const variant = await prisma.productVariant.findFirst({
      where: type === 'barcode' ? { barcode: code, deletedAt: null, product: { shopId, deletedAt: null } } : { qrCode: code, deletedAt: null, product: { shopId, deletedAt: null } },
      include: { product: { include: productInclude } },
    });
    if (!variant) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'No product found for this code');
    return { product: variant.product, variant };
  }
  return { product };
}

export async function getProduct(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const product = await prisma.product.findFirst({ where: { id, shopId, deletedAt: null }, include: productInclude });
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return product;
}

export async function updateProduct(ctx: ReqCtx, id: string, input: Record<string, unknown>) {
  const shopId = requireShopId(ctx);
  const before = await prisma.product.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!before) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  const data: Prisma.ProductUpdateInput = {};
  const str = (k: string) => (input[k] as string | undefined);
  if (str('name') !== undefined) data.name = str('name')!;
  if (str('description') !== undefined) data.description = str('description') ?? null;
  if (input.sku !== undefined) data.sku = (input.sku as string) || null;
  if (input.barcode !== undefined) data.barcode = (input.barcode as string) || null;
  if (input.qrCode !== undefined) data.qrCode = (input.qrCode as string) || null;
  if (str('unit') !== undefined) data.unit = str('unit')!;
  if (input.purchasePrice !== undefined) data.purchasePrice = D(input.purchasePrice as string);
  if (input.sellingPrice !== undefined) data.sellingPrice = D(input.sellingPrice as string);
  if (input.mrp !== undefined) data.mrp = input.mrp ? D(input.mrp as string) : null;
  if (input.taxRate !== undefined) data.taxRate = D(input.taxRate as string);
  if (input.hsnCode !== undefined) data.hsnCode = (input.hsnCode as string) || null;
  if (input.reorderLevel !== undefined) data.reorderLevel = D(input.reorderLevel as string);
  if (input.isActive !== undefined) data.isActive = input.isActive as boolean;
  if (input.categoryId !== undefined) {
    if (input.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: input.categoryId as string, shopId, deletedAt: null } });
      if (!cat) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
      data.category = { connect: { id: input.categoryId as string } };
    } else {
      data.category = { disconnect: true };
    }
  }
  if (input.brandId !== undefined) {
    if (input.brandId) {
      const brand = await prisma.brand.findFirst({ where: { id: input.brandId as string, shopId, deletedAt: null } });
      if (!brand) throw new HttpError(404, 'BRAND_NOT_FOUND', 'Brand not found');
      data.brand = { connect: { id: input.brandId as string } };
    } else {
      data.brand = { disconnect: true };
    }
  }
  try {
    const after = await prisma.product.update({ where: { id }, data, include: productInclude });
    await writeAudit({ ...ctx, action: 'PRODUCT_UPDATED', entityType: 'product', entityId: id, shopId, oldValue: before, newValue: after });
    return after;
  } catch (e) {
    return uniqueError(e, 'PRODUCT');
  }
}

export async function deleteProduct(ctx: ReqCtx, id: string) {
  const shopId = requireShopId(ctx);
  const product = await prisma.product.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await writeAudit({ ...ctx, action: 'PRODUCT_DELETED', entityType: 'product', entityId: id, shopId, severity: 'HIGH', oldValue: { name: product.name } });
  return { deleted: true };
}
