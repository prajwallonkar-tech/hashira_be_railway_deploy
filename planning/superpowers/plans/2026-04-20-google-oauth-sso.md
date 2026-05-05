# POST /v1/auth/google — Google OAuth SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /v1/auth/google` — verifies Google ID token (RS256 via JWKS), looks up/links user, checks org status, and issues `hashira_session` + `hashira_refresh` cookies directly with no OTP step.

**Architecture:** Controller → Service → Repository pattern. `jose` handles Google JWKS verification with a 1-hour cache. `jsonwebtoken` (already installed) issues the Hashira JWT. Session token (HS256, 24h) and refresh token (32 random bytes, 7d) both set as httpOnly cookies. 403 errors use `ForbiddenError` (not `AuthError`) — `AuthError` always emits 401; `ForbiddenError` emits 403 per the existing error class design in `src/types/errors.ts`.

**Tech Stack:** Express.js, TypeORM, Zod, jose (new — needs install), jsonwebtoken (existing), Jest + Supertest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Install | `jose` package | Google JWKS/RS256 token verification |
| Modify | `src/config/env.ts` | Add `GOOGLE_CLIENT_ID` |
| Create | `src/utils/jwt.ts` | `signJwt(payload)` + `generateRefreshToken()` |
| Create | `src/validators/google-auth.validator.ts` | `GoogleAuthSchema`, `GoogleAuthBody` type |
| Modify | `src/repositories/user.repository.ts` | Add `findUserByGoogleSub`, `updateUserGoogleSub` |
| Create | `src/repositories/organisation.repository.ts` | `findOrgById(orgId)` |
| Create | `src/repositories/refresh-token.repository.ts` | `insertRefreshToken(userId, tokenHash, expiresAt)` |
| Create | `src/services/google-auth.service.test.ts` | Unit tests for GoogleAuthService (TDD RED) |
| Create | `src/services/google-auth.service.ts` | `GoogleAuthService.createGoogleSession` (TDD GREEN) |
| Create | `src/controllers/google-auth.controller.ts` | `createGoogleSession` handler — sets cookies |
| Modify | `src/routes/auth.routes.ts` | Add `POST /google` |
| Modify | `src/docs/auth.docs.ts` | Add swagger JSDoc for `/auth/google` |
| Create | `src/routes/google-auth.routes.test.ts` | Integration tests |

---

## Task 1: Install jose + extend env

**Files:**
- Modify: `src/config/env.ts`

- [ ] **Step 1: Install jose**

```bash
npm install jose
```
Expected: `added N packages`

- [ ] **Step 2: Update src/config/env.ts**

```typescript
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SES_FROM_EMAIL: z.string().email().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 3: Add GOOGLE_CLIENT_ID to .env** (do this manually — file is gitignored)

```
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts
git commit -m "feat(auth): add GOOGLE_CLIENT_ID env var"
```

---

## Task 2: JWT utility

**Files:**
- Create: `src/utils/jwt.ts`

- [ ] **Step 1: Create src/utils/jwt.ts**

```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface JwtPayload {
  user_id: string;
  org_id: string | null;
  role: string;
  email: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/jwt.ts
git commit -m "feat(auth): add signJwt and generateRefreshToken utilities"
```

---

## Task 3: Repositories

**Files:**
- Modify: `src/repositories/user.repository.ts`
- Create: `src/repositories/organisation.repository.ts`
- Create: `src/repositories/refresh-token.repository.ts`

- [ ] **Step 1: Replace src/repositories/user.repository.ts in full**

```typescript
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';

export async function findUserByEmail(email: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({ where: { email } });
}

export async function findUserByGoogleSub(googleSub: string): Promise<User | null> {
  return AppDataSource.getRepository(User).findOne({ where: { google_sub: googleSub } });
}

export async function updateUserGoogleSub(userId: string, googleSub: string): Promise<void> {
  await AppDataSource.getRepository(User).update({ user_id: userId }, { google_sub: googleSub });
}
```

- [ ] **Step 2: Create src/repositories/organisation.repository.ts**

```typescript
import { AppDataSource } from '../config/database';
import { Organisation } from '../entities/organisation.entity';

export async function findOrgById(orgId: string): Promise<Organisation | null> {
  return AppDataSource.getRepository(Organisation).findOne({ where: { org_id: orgId } });
}
```

- [ ] **Step 3: Create src/repositories/refresh-token.repository.ts**

```typescript
import { AppDataSource } from '../config/database';
import { RefreshToken } from '../entities/refresh-token.entity';

export async function insertRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  const repo = AppDataSource.getRepository(RefreshToken);
  const token = repo.create({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used: false,
  });
  await repo.save(token);
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/repositories/user.repository.ts src/repositories/organisation.repository.ts src/repositories/refresh-token.repository.ts
git commit -m "feat(auth): add findUserByGoogleSub, updateUserGoogleSub, findOrgById, insertRefreshToken"
```

---

## Task 4: Validator + route stub

**Files:**
- Create: `src/validators/google-auth.validator.ts`
- Modify: `src/routes/auth.routes.ts`

- [ ] **Step 1: Create src/validators/google-auth.validator.ts**

```typescript
import { z } from 'zod';

export const GoogleAuthSchema = z.object({
  google_id_token: z.string().min(1, { message: 'google_id_token is required' }),
});

export type GoogleAuthBody = z.infer<typeof GoogleAuthSchema>;
```

- [ ] **Step 2: Update src/routes/auth.routes.ts — add stub for /google**

The controller doesn't exist yet. Add a temporary 501 stub so the file compiles and integration tests can be written against it.

```typescript
import { Router } from 'express';
import { ipRateLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validateBody';
import { LoginSchema } from '../validators/auth.validator';
import { GoogleAuthSchema } from '../validators/google-auth.validator';
import { createSession } from '../controllers/auth.controller';

export const authRouter = Router();

authRouter.post('/session', ipRateLimiter, validateBody(LoginSchema), createSession);

authRouter.post('/google', ipRateLimiter, validateBody(GoogleAuthSchema), (_req, res) => {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } });
});
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/validators/google-auth.validator.ts src/routes/auth.routes.ts
git commit -m "feat(auth): add GoogleAuthSchema validator and /google route stub"
```

---

## Task 5: Service unit tests (TDD — RED)

**Files:**
- Create: `src/services/google-auth.service.test.ts`

- [ ] **Step 1: Create src/services/google-auth.service.test.ts**

```typescript
import * as jose from 'jose';
import * as userRepo from '../repositories/user.repository';
import * as orgRepo from '../repositories/organisation.repository';
import * as refreshTokenRepo from '../repositories/refresh-token.repository';
import * as jwtUtils from '../utils/jwt';
import { GoogleAuthService } from './google-auth.service';
import { UserRole, UserStatus, OrgStatus, SubscriptionStatus } from '../types/enums';
import { User } from '../entities/user.entity';
import { Organisation } from '../entities/organisation.entity';

jest.mock('jose');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/organisation.repository');
jest.mock('../repositories/refresh-token.repository');
jest.mock('../utils/jwt');

const mockJwtVerify = jose.jwtVerify as jest.Mock;
const mockFindUserByGoogleSub = userRepo.findUserByGoogleSub as jest.MockedFunction<
  typeof userRepo.findUserByGoogleSub
>;
const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
>;
const mockUpdateUserGoogleSub = userRepo.updateUserGoogleSub as jest.MockedFunction<
  typeof userRepo.updateUserGoogleSub
>;
const mockFindOrgById = orgRepo.findOrgById as jest.MockedFunction<typeof orgRepo.findOrgById>;
const mockInsertRefreshToken = refreshTokenRepo.insertRefreshToken as jest.MockedFunction<
  typeof refreshTokenRepo.insertRefreshToken
>;
const mockSignJwt = jwtUtils.signJwt as jest.MockedFunction<typeof jwtUtils.signJwt>;
const mockGenerateRefreshToken = jwtUtils.generateRefreshToken as jest.MockedFunction<
  typeof jwtUtils.generateRefreshToken
>;

const TEST_EMAIL = 'user@example.com';
const TEST_GOOGLE_SUB = 'google-sub-abc123';
const VALID_ID_TOKEN = 'valid.google.id.token';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: null,
    google_sub: TEST_GOOGLE_SUB,
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    mfa_enabled: false,
    totp_secret: null,
    totp_secret_pending: null,
    invited_by: null,
    created_at: new Date(),
    ...overrides,
  } as User;
}

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    org_id: 'mock-org-uuid-1',
    name: 'Test Org',
    status: OrgStatus.ACTIVE,
    user_limit: 10,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: SubscriptionStatus.TRIALING,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Organisation;
}

function mockValidToken(overrides: Record<string, unknown> = {}): void {
  mockJwtVerify.mockResolvedValue({
    payload: { sub: TEST_GOOGLE_SUB, email: TEST_EMAIL, email_verified: true, ...overrides },
    protectedHeader: { alg: 'RS256' },
  });
}

let service: GoogleAuthService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new GoogleAuthService();
  mockSignJwt.mockReturnValue(MOCK_SESSION_TOKEN);
  mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  mockInsertRefreshToken.mockResolvedValue(undefined);
  mockUpdateUserGoogleSub.mockResolvedValue(undefined);
});

describe('GoogleAuthService.createGoogleSession', () => {
  describe('token verification', () => {
    it('throws AuthError UNAUTHORIZED when jose.jwtVerify rejects', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWTExpired'));

      await expect(service.createGoogleSession(VALID_ID_TOKEN)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    it('throws AuthError UNAUTHORIZED when email_verified is false', async () => {
      mockValidToken({ email_verified: false });

      await expect(service.createGoogleSession(VALID_ID_TOKEN)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });
  });

  describe('user lookup', () => {
    it('throws ForbiddenError NO_INVITATION when no user found by google_sub or email', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);

      await expect(service.createGoogleSession(VALID_ID_TOKEN)).rejects.toMatchObject({
        code: 'NO_INVITATION',
        statusCode: 403,
      });
    });

    it('links google_sub and proceeds when invited user found by email with no google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(makeUser({ google_sub: null }));
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockUpdateUserGoogleSub).toHaveBeenCalledWith('mock-user-uuid-1', TEST_GOOGLE_SUB);
    });

    it('does not call updateUserGoogleSub when user already has google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockUpdateUserGoogleSub).not.toHaveBeenCalled();
    });

    it('does not fall back to email lookup when user found by google_sub', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());

      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockFindUserByEmail).not.toHaveBeenCalled();
    });
  });

  describe('org status check', () => {
    it('throws ForbiddenError ORG_SUSPENDED when org is suspended', async () => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg({ status: OrgStatus.SUSPENDED }));

      await expect(service.createGoogleSession(VALID_ID_TOKEN)).rejects.toMatchObject({
        code: 'ORG_SUSPENDED',
        statusCode: 403,
      });
    });
  });

  describe('successful session creation', () => {
    beforeEach(() => {
      mockValidToken();
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());
    });

    it('calls signJwt with correct payload', async () => {
      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockSignJwt).toHaveBeenCalledWith({
        user_id: 'mock-user-uuid-1',
        org_id: 'mock-org-uuid-1',
        role: UserRole.MEMBER,
        email: TEST_EMAIL,
      });
    });

    it('inserts refresh token with SHA-256 hash and 7-day expiry', async () => {
      await service.createGoogleSession(VALID_ID_TOKEN);

      expect(mockInsertRefreshToken).toHaveBeenCalledTimes(1);
      const [userId, tokenHash, expiresAt] = mockInsertRefreshToken.mock.calls[0];
      expect(userId).toBe('mock-user-uuid-1');
      expect(tokenHash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    });

    it('returns sessionToken, refreshToken, and user data', async () => {
      const result = await service.createGoogleSession(VALID_ID_TOKEN);

      expect(result.sessionToken).toBe(MOCK_SESSION_TOKEN);
      expect(result.refreshToken).toBe(MOCK_REFRESH_TOKEN);
      expect(result.user.user_id).toBe('mock-user-uuid-1');
      expect(result.user.email).toBe(TEST_EMAIL);
      expect(result.user.role).toBe(UserRole.MEMBER);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect RED (module not found)**

```bash
npm test -- google-auth.service.test.ts
```
Expected: FAIL — `Cannot find module './google-auth.service'`

---

## Task 6: Implement GoogleAuthService (TDD — GREEN)

**Files:**
- Create: `src/services/google-auth.service.ts`

- [ ] **Step 1: Create src/services/google-auth.service.ts**

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  findUserByGoogleSub,
  findUserByEmail,
  updateUserGoogleSub,
} from '../repositories/user.repository';
import { findOrgById } from '../repositories/organisation.repository';
import { insertRefreshToken } from '../repositories/refresh-token.repository';
import { signJwt, generateRefreshToken, JwtPayload } from '../utils/jwt';
import { hashSHA256 } from '../utils/crypto';
import { AuthError, ForbiddenError } from '../types/errors';
import { OrgStatus } from '../types/enums';
import { env } from '../config/env';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { cacheMaxAge: 60 * 60 * 1000 },
);

export interface GoogleSessionResult {
  sessionToken: string;
  refreshToken: string;
  user: JwtPayload;
}

export class GoogleAuthService {
  async createGoogleSession(idToken: string): Promise<GoogleSessionResult> {
    let sub: string;
    let email: string;
    let emailVerified: boolean;

    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        audience: env.GOOGLE_CLIENT_ID,
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
      });
      sub = payload.sub as string;
      email = payload['email'] as string;
      emailVerified = payload['email_verified'] as boolean;
    } catch {
      throw new AuthError('Invalid or expired Google ID token', 'UNAUTHORIZED');
    }

    if (!emailVerified) {
      throw new AuthError('Google account email is not verified', 'UNAUTHORIZED');
    }

    let user = await findUserByGoogleSub(sub);

    if (!user) {
      const existingUser = await findUserByEmail(email);
      if (existingUser && existingUser.google_sub === null) {
        await updateUserGoogleSub(existingUser.user_id, sub);
        user = { ...existingUser, google_sub: sub };
      }
    }

    if (!user) {
      throw new ForbiddenError('No invitation found for this account', 'NO_INVITATION');
    }

    const org = await findOrgById(user.org_id!);
    if (org?.status === OrgStatus.SUSPENDED) {
      throw new ForbiddenError('Organisation is suspended', 'ORG_SUSPENDED');
    }

    const jwtPayload: JwtPayload = {
      user_id: user.user_id,
      org_id: user.org_id,
      role: user.role,
      email: user.email,
    };

    const sessionToken = signJwt(jwtPayload);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashSHA256(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await insertRefreshToken(user.user_id, tokenHash, expiresAt);

    return { sessionToken, refreshToken, user: jwtPayload };
  }
}

export const googleAuthService = new GoogleAuthService();
```

- [ ] **Step 2: Run tests — expect GREEN**

```bash
npm test -- google-auth.service.test.ts
```
Expected: all tests PASS

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/services/google-auth.service.ts src/services/google-auth.service.test.ts
git commit -m "feat(auth): implement GoogleAuthService with TDD"
```

---

## Task 7: Controller + wire route

**Files:**
- Create: `src/controllers/google-auth.controller.ts`
- Modify: `src/routes/auth.routes.ts`

- [ ] **Step 1: Create src/controllers/google-auth.controller.ts**

```typescript
import { Request, Response, NextFunction } from 'express';
import { googleAuthService } from '../services/google-auth.service';
import { GoogleAuthBody } from '../validators/google-auth.validator';

const SESSION_MAX_AGE_MS = 86400 * 1000;
const REFRESH_MAX_AGE_MS = 604800 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function createGoogleSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { google_id_token } = req.body as GoogleAuthBody;
  googleAuthService
    .createGoogleSession(google_id_token)
    .then(({ sessionToken, refreshToken, user }) => {
      res.cookie('hashira_session', sessionToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: SESSION_MAX_AGE_MS,
      });
      res.cookie('hashira_refresh', refreshToken, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: REFRESH_MAX_AGE_MS,
      });
      res.status(200).json({
        data: {
          user_id: user.user_id,
          email: user.email,
          role: user.role,
        },
        meta: { request_id: res.locals.requestId as string },
      });
    })
    .catch((err: unknown) => next(err));
}
```

- [ ] **Step 2: Replace src/routes/auth.routes.ts — wire real controller, remove stub**

```typescript
import { Router } from 'express';
import { ipRateLimiter } from '../middleware/rateLimiter';
import { validateBody } from '../middleware/validateBody';
import { LoginSchema } from '../validators/auth.validator';
import { GoogleAuthSchema } from '../validators/google-auth.validator';
import { createSession } from '../controllers/auth.controller';
import { createGoogleSession } from '../controllers/google-auth.controller';

export const authRouter = Router();

authRouter.post('/session', ipRateLimiter, validateBody(LoginSchema), createSession);

authRouter.post('/google', ipRateLimiter, validateBody(GoogleAuthSchema), createGoogleSession);
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/controllers/google-auth.controller.ts src/routes/auth.routes.ts
git commit -m "feat(auth): add createGoogleSession controller and wire POST /google route"
```

---

## Task 8: Swagger docs

**Files:**
- Modify: `src/docs/auth.docs.ts`

- [ ] **Step 1: Append to src/docs/auth.docs.ts**

Add this block after the existing `/auth/session` JSDoc comment:

```typescript
/**
 * @openapi
 * /auth/google:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Google OAuth SSO login (single-step)
 *     description: >
 *       Verifies a Google ID token (RS256 via JWKS). Requires email_verified=true.
 *       Looks up user by google_sub; falls back to email lookup for invited users on
 *       first Google login and links google_sub. Issues hashira_session (24h JWT) and
 *       hashira_refresh (7d rotating) httpOnly cookies. No OTP step.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - google_id_token
 *             properties:
 *               google_id_token:
 *                 type: string
 *                 description: Google ID token from client-side OAuth flow
 *     responses:
 *       200:
 *         description: Authenticated — hashira_session and hashira_refresh cookies set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                 meta:
 *                   type: object
 *                   properties:
 *                     request_id:
 *                       type: string
 *       400:
 *         description: Validation error (missing google_id_token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid/expired token or email_verified=false
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: NO_INVITATION (user not found) or ORG_SUSPENDED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
```

- [ ] **Step 2: Restart dev server and verify**

```bash
npm run start:dev
```
Open `http://localhost:3000/api-docs` — expect `POST /auth/google` listed under the **Auth** tag.

- [ ] **Step 3: Commit**

```bash
git add src/docs/auth.docs.ts
git commit -m "docs(auth): add swagger JSDoc for POST /auth/google"
```

---

## Task 9: Integration tests

**Files:**
- Create: `src/routes/google-auth.routes.test.ts`

- [ ] **Step 1: Create src/routes/google-auth.routes.test.ts**

```typescript
import request from 'supertest';
import { app } from '../app';
import * as userRepo from '../repositories/user.repository';
import * as orgRepo from '../repositories/organisation.repository';
import * as refreshTokenRepo from '../repositories/refresh-token.repository';
import * as jose from 'jose';
import * as jwtUtils from '../utils/jwt';
import { UserRole, UserStatus, OrgStatus, SubscriptionStatus } from '../types/enums';
import { User } from '../entities/user.entity';
import { Organisation } from '../entities/organisation.entity';

jest.mock('jose');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/organisation.repository');
jest.mock('../repositories/refresh-token.repository');
jest.mock('../utils/jwt');

const mockJwtVerify = jose.jwtVerify as jest.Mock;
const mockFindUserByGoogleSub = userRepo.findUserByGoogleSub as jest.MockedFunction<
  typeof userRepo.findUserByGoogleSub
>;
const mockFindUserByEmail = userRepo.findUserByEmail as jest.MockedFunction<
  typeof userRepo.findUserByEmail
>;
const mockFindOrgById = orgRepo.findOrgById as jest.MockedFunction<typeof orgRepo.findOrgById>;
const mockInsertRefreshToken = refreshTokenRepo.insertRefreshToken as jest.MockedFunction<
  typeof refreshTokenRepo.insertRefreshToken
>;
const mockSignJwt = jwtUtils.signJwt as jest.MockedFunction<typeof jwtUtils.signJwt>;
const mockGenerateRefreshToken = jwtUtils.generateRefreshToken as jest.MockedFunction<
  typeof jwtUtils.generateRefreshToken
>;

interface ApiBody {
  data?: { user_id?: string; email?: string; role?: string };
  error?: { code?: string; message?: string };
  meta?: { request_id?: string };
}
function body(res: { body: unknown }): ApiBody {
  return res.body as ApiBody;
}

const TEST_EMAIL = 'user@example.com';
const TEST_GOOGLE_SUB = 'google-sub-abc123';
const VALID_ID_TOKEN = 'valid.google.id.token';
const MOCK_SESSION_TOKEN = 'mock.jwt.session.token';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token-base64url';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: 'mock-user-uuid-1',
    org_id: 'mock-org-uuid-1',
    email: TEST_EMAIL,
    password_hash: null,
    google_sub: TEST_GOOGLE_SUB,
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    mfa_enabled: false,
    totp_secret: null,
    totp_secret_pending: null,
    invited_by: null,
    created_at: new Date(),
    ...overrides,
  } as User;
}

function makeOrg(overrides: Partial<Organisation> = {}): Organisation {
  return {
    org_id: 'mock-org-uuid-1',
    name: 'Test Org',
    status: OrgStatus.ACTIVE,
    user_limit: 10,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: SubscriptionStatus.TRIALING,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Organisation;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignJwt.mockReturnValue(MOCK_SESSION_TOKEN);
  mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  mockInsertRefreshToken.mockResolvedValue(undefined);
});

describe('POST /v1/auth/google', () => {
  describe('request validation', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/v1/auth/google').send({});
      expect(res.status).toBe(400);
      expect(body(res).error?.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when google_id_token is missing', async () => {
      const res = await request(app).post('/v1/auth/google').send({ other: 'field' });
      expect(res.status).toBe(400);
      expect(body(res).error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('token verification', () => {
    it('returns 401 UNAUTHORIZED when token is invalid', async () => {
      mockJwtVerify.mockRejectedValue(new Error('JWTExpired'));

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(401);
      expect(body(res).error?.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when email_verified is false', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: TEST_GOOGLE_SUB, email: TEST_EMAIL, email_verified: false },
        protectedHeader: { alg: 'RS256' },
      });

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(401);
      expect(body(res).error?.code).toBe('UNAUTHORIZED');
    });
  });

  describe('user lookup', () => {
    it('returns 403 NO_INVITATION when user not found', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: TEST_GOOGLE_SUB, email: TEST_EMAIL, email_verified: true },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(403);
      expect(body(res).error?.code).toBe('NO_INVITATION');
    });

    it('returns 403 ORG_SUSPENDED when org is suspended', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: TEST_GOOGLE_SUB, email: TEST_EMAIL, email_verified: true },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg({ status: OrgStatus.SUSPENDED }));

      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(403);
      expect(body(res).error?.code).toBe('ORG_SUSPENDED');
    });
  });

  describe('successful login', () => {
    beforeEach(() => {
      mockJwtVerify.mockResolvedValue({
        payload: { sub: TEST_GOOGLE_SUB, email: TEST_EMAIL, email_verified: true },
        protectedHeader: { alg: 'RS256' },
      });
      mockFindUserByGoogleSub.mockResolvedValue(makeUser());
      mockFindOrgById.mockResolvedValue(makeOrg());
    });

    it('returns 200 with user data', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(res.status).toBe(200);
      expect(body(res).data?.email).toBe(TEST_EMAIL);
      expect(body(res).data?.role).toBe(UserRole.MEMBER);
      expect(body(res).meta?.request_id).toBeDefined();
    });

    it('sets hashira_session cookie', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      const cookies = res.headers['set-cookie'] as string[] | string;
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArr.some((c) => c.startsWith('hashira_session='))).toBe(true);
    });

    it('sets hashira_refresh cookie', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      const cookies = res.headers['set-cookie'] as string[] | string;
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
      expect(cookieArr.some((c) => c.startsWith('hashira_refresh='))).toBe(true);
    });

    it('includes meta.request_id in every response', async () => {
      const res = await request(app)
        .post('/v1/auth/google')
        .send({ google_id_token: VALID_ID_TOKEN });

      expect(body(res).meta?.request_id).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run integration tests — expect GREEN**

```bash
npm test -- google-auth.routes.test.ts
```
Expected: all tests PASS

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all tests PASS

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/google-auth.routes.test.ts
git commit -m "test(auth): add integration tests for POST /v1/auth/google"
```

---

## Verification Checklist

- [x] `POST /v1/auth/google` endpoint exists
- [x] jose JWKS verification (RS256, audience=GOOGLE_CLIENT_ID, issuer, exp)
- [x] email_verified=true enforced → 401 UNAUTHORIZED
- [x] User lookup by google_sub first, fallback to email for invited users
- [x] google_sub linked on first Google login (updateUserGoogleSub called)
- [x] NO_INVITATION 403 if no user found by either method
- [x] ORG_SUSPENDED 403 if org.status === 'suspended'
- [x] hashira_session JWT (HS256, 24h, httpOnly, SameSite=Strict)
- [x] hashira_refresh token (32 random bytes Base64URL, SHA-256 hashed in DB, 7d, httpOnly, SameSite=Strict)
- [x] No OTP step
- [x] Swagger docs at /api-docs (`POST /auth/google` under Auth tag)
- [x] Unit tests: GoogleAuthService (9 cases — all service logic paths)
- [x] Integration tests: POST /v1/auth/google (9 cases — HTTP layer)
