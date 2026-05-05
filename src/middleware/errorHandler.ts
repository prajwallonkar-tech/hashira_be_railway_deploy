import { Request, Response, NextFunction } from 'express';
import { AppError, RateLimitError } from '../types/errors';

// Express identifies error handlers by their 4-parameter arity
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err instanceof RateLimitError && err.retryAfter !== undefined) {
      res.set('Retry-After', String(err.retryAfter));
    }
    res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
    });
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    statusCode: 500,
    message: isProduction
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred',
  });
}
