import { Router } from 'express';
import { ipRateLimiter } from '../../middleware/rateLimiter';
import { validateInvitation } from '../../controllers/invitation/invitation.controller';

export const invitationRouter = Router();

// GET /v1/invitations/validate?token=<plain_token>
invitationRouter.get('/validate', ipRateLimiter, validateInvitation);
