import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import type { Queue } from 'bullmq';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/authenticate';
import { authRouter } from './routes/auth/auth.routes';
import { organisationRouter } from './routes/organisation/organisation.routes';
import { invitationRouter } from './routes/invitation/invitation.routes';
import { eventRouter } from './routes/event/event.routes';
import { getMe } from './controllers/auth/me.controller';
import { swaggerSpec } from './config/swagger';
import type { AnchorEventJobData } from './queues/anchor.queue';

let anchorQueue: Queue<AnchorEventJobData> | null = null;

export function setAnchorQueue(q: Queue<AnchorEventJobData> | null): void {
  anchorQueue = q;
}

const app = express();

app.use(requestId);
app.use(requestLogger);
app.use(helmet());
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
];
const TAURI_ORIGINS = [
  'tauri://localhost',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://127.0.0.1:1430'
];
const allowedOrigins = [
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : DEV_ORIGINS),
  ...TAURI_ORIGINS,
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/v1/auth', authRouter);
app.use('/v1/organisations', organisationRouter);
app.use('/v1/invitations', invitationRouter);
app.use('/v1/events', eventRouter);
app.get('/v1/me', authenticate, getMe);

app.get('/health/queue', (_req, res, next) => {
  (async () => {
    if (!anchorQueue) {
      res.status(503).json({ status: 'unavailable' });
      return;
    }
    const counts = await anchorQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    res.json({ status: 'ok', queue: counts });
  })().catch(next);
});

app.use(errorHandler);

export { app };
