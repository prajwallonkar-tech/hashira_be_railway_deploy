import type { IncomingMessage, ServerResponse } from 'http';
import pinoHttp from 'pino-http';
import { logger } from '../logger';

export const requestLogger = pinoHttp({
  logger,
  customProps: (_req, res) => ({
    request_id: res.getHeader('x-request-id') as string | undefined,
  }),
  // Skip noisy health polling from logs
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === '/health/queue',
  },
  // Never log request/response bodies — they may contain sensitive data
  serializers: {
    req: (req: IncomingMessage) => ({
      method: req.method,
      url: req.url,
    }),
    res: (res: ServerResponse) => ({
      statusCode: res.statusCode,
    }),
  },
});
