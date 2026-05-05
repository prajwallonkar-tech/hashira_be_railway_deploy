import request from 'supertest';
import express from 'express';
import { eventRouter } from './event.routes';
import { errorHandler } from '../../middleware/errorHandler';

jest.mock('../../middleware/validateApiKey', () => ({
  validateApiKey: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.apiKey = (req as express.Request & { _mockApiKey?: typeof req.apiKey })
      ._mockApiKey ?? {
      key_id: 'key-1',
      org_id: 'org-1',
      user_id: null,
      permissions: ['events:write'],
    };
    next();
  },
}));

jest.mock('../../middleware/rateLimiter', () => ({
  apiKeyBurstLimiter: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
  apiKeySustainedLimiter: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock('../../services/event/event-ingestion.service', () => ({
  eventIngestionService: {
    ingest: jest.fn().mockResolvedValue({
      event_id: 'evt-1',
      status: 'processing',
      received_at: new Date(),
      idempotent_replay: false,
    }),
  },
}));

jest.mock('../../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const VALID_BODY = {
  prompt: 'What is the capital of France?',
  output: 'Paris.',
  model_id: 'gpt-4o',
  timestamp: new Date().toISOString(),
};

function buildApp(permissions: string[]) {
  const app = express();
  app.use(express.json());
  // Inject the permissions via a pre-middleware that sets req.apiKey
  app.use((req, _res, next) => {
    (req as express.Request & { _mockApiKey?: unknown })._mockApiKey = {
      key_id: 'key-1',
      org_id: 'org-1',
      user_id: null,
      permissions,
    };
    next();
  });
  app.use('/v1/events', eventRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /v1/events — permission enforcement', () => {
  it('returns 202 when the API key has events:write permission', async () => {
    await request(buildApp(['events:write']))
      .post('/v1/events')
      .send(VALID_BODY)
      .expect(202);
  });

  it('returns 403 INSUFFICIENT_PERMISSIONS when the key has only events:read', async () => {
    const res = await request(buildApp(['events:read']))
      .post('/v1/events')
      .send(VALID_BODY)
      .expect(403);

    expect((res.body as { code: string }).code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });

  it('returns 403 INSUFFICIENT_PERMISSIONS when the key has verification:read only', async () => {
    const res = await request(buildApp(['verification:read']))
      .post('/v1/events')
      .send(VALID_BODY)
      .expect(403);

    expect((res.body as { code: string }).code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });

  it('returns 403 INSUFFICIENT_PERMISSIONS when the key has no permissions', async () => {
    const res = await request(buildApp([]))
      .post('/v1/events')
      .send(VALID_BODY)
      .expect(403);

    expect((res.body as { code: string }).code).toBe(
      'INSUFFICIENT_PERMISSIONS',
    );
  });
});
