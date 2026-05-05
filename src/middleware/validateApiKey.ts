import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/api-key/api-key.service';
import { AuthError } from '../types/errors';

export interface ApiKeyContext {
  key_id: string;
  org_id: string;
  user_id: string | null;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

const API_KEY_HEADER = 'x-api-key';

export function validateApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const headerValue = req.header(API_KEY_HEADER);

  if (!headerValue || headerValue.trim().length === 0) {
    next(new AuthError('API key required', 'API_KEY_REQUIRED'));
    return;
  }

  apiKeyService
    .validateApiKey(headerValue.trim())
    .then((ctx) => {
      req.apiKey = ctx;
      next();
    })
    .catch((err: unknown) => next(err));
}
