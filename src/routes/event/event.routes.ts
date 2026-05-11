import { Router } from 'express';
import { validateApiKey } from '../../middleware/validateApiKey';
import { validateApiKeyPermission } from '../../middleware/validateApiKeyPermission';
import { authenticateFlexible } from '../../middleware/authenticateFlexible';
import { validateBody } from '../../middleware/validateBody';
import {
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
} from '../../middleware/rateLimiter';
import { CreateEventSchema } from '../../validators/event.validator';
import { createEvent } from '../../controllers/event/event.controller';
import {
  listEvents,
  getEvent,
  getVerification,
} from '../../controllers/event/event-query.controller';
import { ApiKeyPermission } from '../../types/enums';

export const eventRouter = Router();

// POST /v1/events — API key only (SDK ingestion path)
eventRouter.post(
  '/',
  validateApiKey,
  validateApiKeyPermission(ApiKeyPermission.EVENTS_WRITE),
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  validateBody(CreateEventSchema),
  createEvent,
);

// GET /v1/events — JWT cookie (dashboard) OR API key (SDK)
eventRouter.get(
  '/',
  authenticateFlexible,
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  listEvents,
);

// GET /v1/events/:event_id/verification (must be before /:event_id)
eventRouter.get(
  '/:event_id/verification',
  authenticateFlexible,
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  getVerification,
);

// GET /v1/events/:event_id
eventRouter.get(
  '/:event_id',
  authenticateFlexible,
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  getEvent,
);
