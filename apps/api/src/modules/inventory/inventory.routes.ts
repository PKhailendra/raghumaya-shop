import { Router } from 'express';
import { z } from 'zod';
import * as c from './inventory.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  categorySchema,
  brandSchema,
  productCreateSchema,
  productUpdateSchema,
  productQuerySchema,
  paginationSchema,
} from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContext);

const view = requirePermission('INVENTORY_VIEW');
const create = requirePermission('INVENTORY_CREATE');
const update = requirePermission('INVENTORY_UPDATE');
const remove = requirePermission('INVENTORY_DELETE');

r.post('/categories', create, validateRequest({ body: categorySchema }), c.createCategory);
r.get('/categories', view, validateRequest({ query: paginationSchema.extend({ search: z.string().trim().max(100).optional(), parentId: z.string().uuid().optional() }) }), c.listCategories);
r.patch('/categories/:id', update, validateRequest({ params: uuidParam, body: categorySchema.partial() }), c.updateCategory);
r.delete('/categories/:id', remove, validateRequest({ params: uuidParam }), c.deleteCategory);

r.post('/brands', create, validateRequest({ body: brandSchema }), c.createBrand);
r.get('/brands', view, validateRequest({ query: paginationSchema.extend({ search: z.string().trim().max(100).optional() }) }), c.listBrands);

r.post('/products', create, validateRequest({ body: productCreateSchema }), c.createProduct);
r.get('/products', view, validateRequest({ query: productQuerySchema }), c.listProducts);
r.get('/products/lookup', view, validateRequest({ query: z.object({ type: z.enum(['barcode', 'qr']), code: z.string().trim().min(1) }) }), c.lookupProduct);
r.get('/products/:id', view, validateRequest({ params: uuidParam }), c.getProduct);
r.patch('/products/:id', update, validateRequest({ params: uuidParam, body: productUpdateSchema }), c.updateProduct);
r.delete('/products/:id', remove, validateRequest({ params: uuidParam }), c.deleteProduct);

export default r;
