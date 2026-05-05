import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = (req.headers['x-request-id'] as string | undefined) || uuidv4();
  res.locals.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
