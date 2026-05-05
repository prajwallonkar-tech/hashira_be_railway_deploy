import { Router } from 'express';
import { ipRateLimiter } from '../../middleware/rateLimiter';
import { validateBody } from '../../middleware/validateBody';
import { CreateOrgSchema } from '../../validators/organisation.validator';
import { createOrganisation } from '../../controllers/organisation/organisation.controller';

export const organisationRouter = Router();

// POST /v1/organisations
organisationRouter.post(
  '/',
  ipRateLimiter,
  validateBody(CreateOrgSchema),
  createOrganisation,
);
