import type { Request, Response } from 'express';
import * as service from './inventory.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCategory(ctxFromReq(req), req.body));
});
export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search, parentId } = req.query as unknown as { page: number; limit: number; search?: string; parentId?: string };
  res.json(await service.listCategories(ctxFromReq(req), page, limit, search, parentId));
});
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateCategory(ctxFromReq(req), req.params.id, req.body));
});
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteCategory(ctxFromReq(req), req.params.id));
});

export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createBrand(ctxFromReq(req), req.body));
});
export const listBrands = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search } = req.query as unknown as { page: number; limit: number; search?: string };
  res.json(await service.listBrands(ctxFromReq(req), page, limit, search));
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createProduct(ctxFromReq(req), req.body));
});
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listProducts(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listProducts>[1]));
});
export const lookupProduct = asyncHandler(async (req: Request, res: Response) => {
  const { type, code } = req.query as unknown as { type: 'barcode' | 'qr'; code: string };
  res.json(await service.lookupProduct(ctxFromReq(req), type, code));
});
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getProduct(ctxFromReq(req), req.params.id));
});
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateProduct(ctxFromReq(req), req.params.id, req.body));
});
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteProduct(ctxFromReq(req), req.params.id));
});
