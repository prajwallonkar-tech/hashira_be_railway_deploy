# TRD Summary — Hashira Backend

**Source:** `planning/trd.md` v0.8 (2026-04-13)

---

## Tech Stack (PERN + AWS)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend runtime | TypeScript + **Express.js** | PERN stack; plain middleware and router |
| Database | **PostgreSQL 16** (Amazon RDS) | TypeORM; single-AZ for MVP |
| Auth | **Email + password** (bcrypt) · **Google OAuth SSO** (JWKS/RS256) | Two auth methods, three client flows |
| Session | **Hashira JWT** (HS256, httpOnly cookie, 24hr) + **rotating refresh token** (httpOnly cookie, 7-day) | Stateless; no Redis for MVP |
| OTP | **AWS SES** | 6-digit OTP on email+password login (mandatory step 2) |
| MFA | **otplib** (TOTP) | Optional per user; secret AES-256 encrypted |
| Encryption | **AES-256** (application-layer) | prompt/output columns encrypted before INSERT; key from AWS Secrets Manager |
| Blockchain | **Base L2** via **QuickNode** RPC | Real-time per-event tx; viem library |
| Key management | **AWS KMS** | Blockchain signing key; never leaves KMS |
| Secrets | **AWS Secrets Manager** | JWT secret, Stripe key, RPC URL, AES-256 key |
| Payments | **Stripe** | Checkout + webhook for org activation |
| Hosting | **AWS ECS Fargate** | Containerised; CPU/memory auto-scaling |
| CDN | **CloudFront + S3** | Serves React SPA |
| SDK | **Python** + **TypeScript** (`@hashira/sdk`) | Client-side event submission |

---

## Decision Log

### Resolved Decisions

| Decision | Resolution | Date |
|----------|-----------|------|
| Session model | Stateless JWT in httpOnly cookie + rotating refresh token (7-day) | 2026-04-01, updated 2026-04-13 |
| Routing | React Router v6 SPA (no SSR, no SEO need) | 2026-04-01 |
| Auth method | Email + password and Google OAuth SSO (Web3Auth removed) | 2026-04-10 |
| Login flow | Two-step: email+password → OTP verification → (TOTP if enrolled) → cookies | 2026-04-13 |
| Backend framework | Express.js (PERN stack) | 2026-04-01 |
| Anchoring model | Real-time per-event (no batching, ever) | 2026-04-01 |
| Verification | No Merkle proof — event hash anchored directly on-chain | 2026-04-01 |
| Encryption at rest | Application-layer AES-256 for prompt/output columns; key from AWS Secrets Manager | 2026-04-13 |
| SDK scope | Python + TypeScript SDKs both in MVP | 2026-04-13 |
| Idempotency | X-Idempotency-Key header; dedup within configurable window | 2026-04-01 |
| Multi-AZ | Deferred to post-MVP scaling milestone | 2026-04-01 |
| Audit logs | Append-only; no soft deletes; no delete endpoint | 2026-04-01 |
| org_id isolation | Service-layer enforcement (not just route guards) | 2026-04-01 |

### Open Decisions

| Decision | Status | Owner |
|----------|--------|-------|
| Blockchain network | Base, Polygon PoS, or Arbitrum One | Engineering Lead + Product |
| Verification bundle format | JSON vs. compressed archive | Engineering Lead |

---

## API Surface (30+ endpoints)

Full endpoint table is in `.claude/project_hashira_be.md`.

Key groupings:
- **Auth** (11): session, OTP verify, Google SSO, refresh, logout, MFA setup/confirm/verify/disable, password reset request/confirm
- **Session** (1): GET /v1/me
- **Events** (5): ingest (API key), list, detail, verification, bundle
- **Organisations** (10): create, get, update, members CRUD, invitations CRUD, API keys CRUD
- **Webhooks** (1): Stripe
- **Super Admin** (5): org list, update limits, suspend, reactivate, audit logs

---

## Security Requirements

See `planning/security-summary.md` for full detail.

Key non-negotiables:
- RBAC: member → own events; admin → org events + settings; super_admin → cross-org
- org_id cross-check on every org-scoped endpoint
- API key: hashed (SHA-256), constant-time comparison, lockout after 10 failures
- JWT: HS256, httpOnly, SameSite=Strict, Secure, Max-Age=86400
- AES-256 encryption for prompt/output before INSERT
- bcrypt always runs (dummy hash for unknown emails — prevents timing enumeration)
- Suspended org: 403 ORG_SUSPENDED on ALL endpoints except GET /v1/me

---

## Infrastructure Diagram

```
External SDK/Client
      ↓ POST /v1/events (X-API-Key)
   ECS Fargate (Express.js)
      ↓ 202 Accepted → async processing
   EventProcessingService
      ↓ canonicalize + SHA-256 (from plaintext) → AES-256 encrypt → INSERT
   BlockchainAnchoringService
      ↓ AWS KMS sign → QuickNode → Base L2
   PostgreSQL RDS (status=anchored, tx_hash, block_number)

React SPA (CloudFront/S3)
      ↓ GET /v1/events (JWT cookie)
   ECS Fargate (Express.js) → PostgreSQL RDS
```
