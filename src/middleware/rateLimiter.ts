import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';
import { RateLimitError } from '../types/errors';

export const ipRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new RateLimitError(
        'Too many requests from this IP',
        'RATE_LIMIT_EXCEEDED',
        60,
      ),
    );
  },
});

const apiKeyKeyGenerator = (req: Request): string => {
  return req.apiKey?.key_id ?? `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
};

// Sustained limit: 300 requests per minute per API key
export const apiKeySustainedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiKeyKeyGenerator,
  handler: (_req, _res, next) => {
    next(
      new RateLimitError(
        'API key rate limit exceeded (300/min)',
        'RATE_LIMIT_EXCEEDED',
        60,
      ),
    );
  },
});

// Burst limit: 50 requests per second per API key
export const apiKeyBurstLimiter = rateLimit({
  windowMs: 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiKeyKeyGenerator,
  handler: (_req, _res, next) => {
    next(
      new RateLimitError(
        'API key burst limit exceeded (50/sec)',
        'RATE_LIMIT_EXCEEDED',
        1,
      ),
    );
  },
});
