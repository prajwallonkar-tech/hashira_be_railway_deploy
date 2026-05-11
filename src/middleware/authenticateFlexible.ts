import { Request, Response, NextFunction } from 'express';
import { authenticate } from './authenticate';
import { validateApiKey } from './validateApiKey';
import { AuthError } from '../types/errors';

const API_KEY_HEADER = 'x-api-key';
const SESSION_COOKIE = 'hashira_session';

export function authenticateFlexible(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionCookie = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const apiKeyHeader = req.header(API_KEY_HEADER);

  if (sessionCookie && sessionCookie.length > 0) {
    authenticate(req, res, next);
    return;
  }

  if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
    validateApiKey(req, res, next);
    return;
  }

  next(new AuthError('Authentication required', 'UNAUTHORIZED'));
}
