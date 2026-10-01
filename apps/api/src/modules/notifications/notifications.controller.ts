import type { Request, Response } from 'express';
import * as service from './notifications.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.listNotifications(ctxFromReq(req), req.query as unknown as Parameters<typeof service.listNotifications>[1]));
});
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.markRead(ctxFromReq(req), req.params.id));
});
export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.markAllRead(ctxFromReq(req)));
});
export const retryNotification = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.retryNotification(ctxFromReq(req), req.params.id));
});
