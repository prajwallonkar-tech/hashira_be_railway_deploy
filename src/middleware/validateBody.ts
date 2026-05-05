import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../types/errors';

export function validateBody(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue: z.ZodIssue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      next(
        new ValidationError(
          'Request validation failed',
          'VALIDATION_ERROR',
          details,
        ),
      );
      return;
    }

    req.body = result.data as unknown;
    next();
  };
}
