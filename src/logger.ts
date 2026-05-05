import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: process.env.SERVICE_NAME ?? 'hashira-api',
    env: process.env.NODE_ENV ?? 'development',
  },
});
