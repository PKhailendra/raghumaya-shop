import type { Request, Response } from 'express';
import * as service from './reports.service';
import { ctxFromReq } from '../ctx';
import { asyncHandler } from '../../middleware/errorHandler';

export const dailyClosing = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.dailyClosing(ctxFromReq(req), req.query.date as string | undefined));
});
