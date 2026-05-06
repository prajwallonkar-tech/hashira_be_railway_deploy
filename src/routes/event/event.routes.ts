import { Router } from 'express';
import { validateApiKey } from '../../middleware/validateApiKey';
import { validateApiKeyPermission } from '../../middleware/validateApiKeyPermission';
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

// POST /v1/events
eventRouter.post(
  '/',
  validateApiKey,
  validateApiKeyPermission(ApiKeyPermission.EVENTS_WRITE),
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  validateBody(CreateEventSchema),
  createEvent,
);

// GET /v1/events
eventRouter.get(
  '/',
  validateApiKey,
  validateApiKeyPermission(ApiKeyPermission.EVENTS_READ),
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  listEvents,
);

// GET /v1/events/:event_id/verification  (must be before /:event_id to avoid route shadowing)
eventRouter.get(
  '/:event_id/verification',
  validateApiKey,
  validateApiKeyPermission(ApiKeyPermission.VERIFICATION_READ),
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  getVerification,
);

// GET /v1/events/:event_id
eventRouter.get(
  '/:event_id',
  validateApiKey,
  validateApiKeyPermission(ApiKeyPermission.EVENTS_READ),
  apiKeyBurstLimiter,
  apiKeySustainedLimiter,
  getEvent,
);
