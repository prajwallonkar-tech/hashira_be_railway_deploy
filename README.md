# Hashira Backend

Cryptographically verifiable, tamper-proof audit records of AI system interactions — anchored in real-time on Base L2.

## Overview

Hashira is a multi-tenant SaaS platform. Each AI interaction event (prompt + output) is canonicalised, SHA-256 hashed, and anchored to the Base L2 blockchain via a single on-chain transaction. The resulting `tx_hash` and `block_number` allow anyone to independently verify that a given event was recorded at a specific point in time and has not been tampered with.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | TypeScript + Express.js on Node.js LTS |
| Database | PostgreSQL 16 (Amazon RDS) via TypeORM |
| Auth | Email + password (bcrypt) · Google OAuth (JWKS/RS256) · OTP via AWS SES · TOTP via otplib |
| Session | Hashira JWT HS256 httpOnly cookie (24hr) + rotating refresh token (7-day) |
| Blockchain | Base L2 via QuickNode RPC + AWS KMS signing (viem) |
| Payments | Stripe (org activation webhook) |
| Deploy | AWS ECS Fargate + CloudFront + S3 |

## Project Structure

```
src/
  config/           # env config (Zod), database datasource
  entities/         # TypeORM entities (9 tables)
  routes/           # Express Router files (one file per domain)
  controllers/      # Thin route handler functions
  services/         # Business logic
  repositories/     # TypeORM query layer
  middleware/        # authenticate, authorize, validateBody, requestId, errorHandler
  types/            # Shared TypeScript types, enums, error classes
  utils/            # Pure utility functions (crypto, canonicalization, encryption)
  app.ts            # Express app setup, middleware registration, route mounting
  main.ts           # Entry point — start server, connect DB
```

## Getting Started

### Prerequisites

- Node.js LTS (v20+)
- PostgreSQL 16
- AWS credentials (KMS + Secrets Manager) — for blockchain anchoring

### Setup

```bash
npm install
cp .env.example .env   # fill in all required values
npm run start:dev
```

### Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | HS256 signing secret for Hashira JWTs (min 32 chars) |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID for ID token verification |
| `AWS_KMS_KEY_ID` | KMS key ARN for blockchain tx signing |
| `QUICKNODE_RPC_URL` | Base L2 RPC endpoint |
| `STRIPE_WEBHOOK_SECRET` | Stripe HMAC-SHA256 webhook secret |

## NPM Commands

```bash
npm run start:dev    # dev server with hot reload
npm run build        # TypeScript compile
npm run test         # Jest unit tests
npm run test:e2e     # E2E tests
npm run lint         # ESLint
```

## API Overview

All routes are prefixed `/v1`. Full endpoint table in `.claude/project_hashira_be.md`.

| Method | Path | Auth |
|--------|------|------|
| POST | /v1/auth/session | None (email + password) |
| POST | /v1/auth/otp/verify | None (email + OTP code) |
| POST | /v1/auth/google | None (Google ID token) |
| POST | /v1/auth/refresh | hashira_refresh cookie |
| GET | /v1/me | JWT cookie |
| POST | /v1/auth/logout | JWT cookie |
| POST | /v1/events | API key (`X-API-Key: hsh_...`) |
| GET | /v1/events | JWT cookie |
| GET | /v1/events/:id/verification | API key |
| POST | /v1/organisations | None |
| POST | /v1/webhooks/stripe | Stripe HMAC signature |

## Key Conventions

1. **org_id on every query** — enforced at service layer, not just route guards
2. **Constant-time API key comparison** — `crypto.timingSafeEqual()`, never `===`
3. **email from verified token only** — never trust identity from req.body
4. **AES-256 encryption** — prompt/output encrypted before INSERT; hash from PLAINTEXT first
5. **SHA-256 canonical hash** — keys sorted alphabetically, nulls stripped, timestamps ISO 8601, 64-char lowercase hex (no `0x`)
6. **No batching** — one blockchain tx per event, always
7. **No soft deletes** — `audit_logs` is append-only; all other deletes are hard deletes
8. **Suspended org** — 403 `ORG_SUSPENDED` on all endpoints except `GET /v1/me`

## Reference Docs

- `planning/epics.md` — epics with acceptance criteria
- `planning/lld-summary.md` — Express.js service design, TypeScript interfaces
- `planning/trd-summary.md` — tech stack, API surface, decision log
- `planning/security-summary.md` — RBAC matrix, auth security, data protection
- `.claude/project_hashira_be.md` — full architecture reference (DB schema, middleware stack, conventions)
# hashira_be_railway_deploy
