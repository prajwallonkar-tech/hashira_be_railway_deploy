import { Router } from 'express';
import { ipRateLimiter } from '../../middleware/rateLimiter';
import { validateBody } from '../../middleware/validateBody';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { CreateOrgSchema } from '../../validators/organisation.validator';
import { CreateApiKeySchema } from '../../validators/api-key.validator';
import { createOrganisation } from '../../controllers/organisation/organisation.controller';
import {
  createKey,
  listKeys,
  revokeKey,
} from '../../controllers/api-key/api-key.controller';
import { UserRole } from '../../types/enums';

export const organisationRouter = Router();

// POST /v1/organisations — public org signup
organisationRouter.post(
  '/',
  ipRateLimiter,
  validateBody(CreateOrgSchema),
  createOrganisation,
);

// POST /v1/organisations/api-keys — admin creates a key for their own org
organisationRouter.post(
  '/api-keys',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  ipRateLimiter,
  validateBody(CreateApiKeySchema),
  createKey,
);

// GET /v1/organisations/api-keys — admin lists keys for their own org
organisationRouter.get(
  '/api-keys',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  ipRateLimiter,
  listKeys,
);

// DELETE /v1/organisations/api-keys/:key_id — admin revokes a key in their own org
organisationRouter.delete(
  '/api-keys/:key_id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  ipRateLimiter,
  revokeKey,
);
