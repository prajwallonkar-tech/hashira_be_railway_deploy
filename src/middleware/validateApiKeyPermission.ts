import { Request, Response, NextFunction } from 'express';
import { ApiKeyPermission } from '../types/enums';
import { ForbiddenError } from '../types/errors';

export function validateApiKeyPermission(
  required: ApiKeyPermission,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, _res, next) => {
    if (!req.apiKey) {
      next(
        new ForbiddenError(
          'API key context missing',
          'INSUFFICIENT_PERMISSIONS',
        ),
      );
      return;
    }
    if (!req.apiKey.permissions.includes(required)) {
      next(
        new ForbiddenError(
          'API key does not have required permission',
          'INSUFFICIENT_PERMISSIONS',
        ),
      );
      return;
    }
    next();
  };
}
