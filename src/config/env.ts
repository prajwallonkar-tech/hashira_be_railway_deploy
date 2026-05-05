import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SES_FROM_EMAIL: z.string().email().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
  TOTP_ENCRYPTION_KEY: z.string().min(32).optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SERVICE_NAME: z.string().default('hashira-api'),
});

export const env = envSchema.parse(process.env);
