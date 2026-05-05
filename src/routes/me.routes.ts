import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getMe } from '../controllers/auth/me.controller';

export const meRouter = Router();

// GET /v1/me
meRouter.get('/', authenticate, getMe);
