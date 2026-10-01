import type { Request, Response } from 'express';
import * as service from './shops.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const createShop = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createShop(ctxFromReq(req), req.body));
});

export const myShops = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.myShops(ctxFromReq(req)) });
});

export const getShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getShop(ctxFromReq(req), req.params.id));
});

export const updateShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateShop(ctxFromReq(req), req.params.id, req.body));
});

export const switchShop = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.switchShop(ctxFromReq(req), req.body.shopId));
});

export const listMembers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  res.json(await service.listMembers(ctxFromReq(req), req.params.id, page, limit));
});

export const inviteMember = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.inviteMember(ctxFromReq(req), req.params.id, req.body));
});

export const updateMember = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateMember(ctxFromReq(req), req.params.id, req.params.memberId, req.body));
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.removeMember(ctxFromReq(req), req.params.id, req.params.memberId));
});
