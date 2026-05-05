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
