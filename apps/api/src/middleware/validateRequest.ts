import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from './errorHandler';

export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/** Validate body/query/params with Zod and replace req values with parsed output. */
export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      const zodErr = err as { issues?: Array<{ path: (string | number)[]; message: string }> };
      const details = (zodErr.issues ?? []).map((i) => ({ path: i.path.join('.'), message: i.message }));
      next(new HttpError(422, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
  };
}
