# Epics — Hashira Backend

**Source:** `planning/trd.md` v0.8 + `planning/lld.md` v1.0

---

## Epic Summary Table

| Epic ID | Title | Type | Module | Effort |
|---------|-------|------|--------|--------|
| E01 | User Authentication & Session (Email+Password, Google OAuth, OTP, MFA) | Backend | Auth | L |
| E02 | AI Event Logging — Python SDK | Backend | SDK | L |
| E03 | AI Event Logging — REST API | Backend | Event Ingestion | M |
| E04 | Event Canonicalisation & SHA-256 Hashing | Backend | Event Processing | S |
| E05 | Real-Time Blockchain Anchoring (per-event, no batching) | Backend | Blockchain | XL |
| E06 | Secure Event Storage (PostgreSQL, org-isolated, AES-256 encrypted) | Backend | Storage | M |
| E07 | Audit Event Search & Filtering API | Backend | Dashboard API | M |
| E08 | Verification API & Bundle Generation | Backend | Verification | M |
| E09 | Org Onboarding & Stripe Payment Activation | Backend | Onboarding | L |
| E10 | Organisation Management (API keys, settings) | Backend | Org Admin | M |
| E11 | Organisation Membership Management | Backend | Org Admin | M |
| E12 | Organisation Subscription & User Limits | Backend | Billing | M |
| E13 | Super Admin — Organisation Management | Backend | Super Admin | M |
| E14 | Super Admin — Suspend & Reactivate Orgs | Backend | Super Admin | M |
| E15 | Frontend: Authentication & Session Flows | Frontend | Auth UI | M |
| E16 | Frontend: Routing, Navigation & Global Layout | Frontend | Shell / Navigation | M |
| E17 | Frontend: Audit Event Log Dashboard | Frontend | Dashboard UI | M |
| E18 | Frontend: Event Detail & Verification | Frontend | Event Detail UI | M |
| E19 | Frontend: Admin Screens — Settings, Members, API Keys, Billing | Frontend | Admin UI | L |
| E20 | Frontend: Super Admin Screens | Frontend | Super Admin UI | M |

---

## E01 — User Authentication & Session

**Goal:** Implement server-side auth lifecycle — email+password login with OTP verification, Google OAuth SSO, TOTP MFA, refresh token rotation, user provisioning.

**Key Acceptance Criteria:**
- `POST /v1/auth/session` — bcrypt.compare (always runs, even for unknown emails using dummy hash) → generate 6-digit OTP → SHA-256 hash → store in otp_tokens → send via AWS SES → return `{ status: "otp_required" }`. NO cookie issued.
- `POST /v1/auth/otp/verify` — validate OTP hash → if user has mfa_enabled: return `{ status: "mfa_required" }` → else: issue `hashira_session` (HS256 JWT, 24hr) + `hashira_refresh` (rotating, 7-day) cookies
- `POST /v1/auth/mfa/verify` — validate TOTP code via otplib → issue both cookies
- `POST /v1/auth/google` — verify Google ID token via JWKS → require email_verified=true → lookup by google_sub → issue both cookies directly (no OTP step)
- `POST /v1/auth/refresh` — rotate refresh token (mark old as used, issue new pair)
- `POST /v1/auth/logout` — clear both cookies, mark refresh token as used
- `GET /v1/me` → `{ user_id, email, role, org_id, org_name, org_status }`
- MFA lifecycle: `POST /v1/auth/mfa/setup` → `/confirm` → `/disable`
- Password reset: `POST /v1/auth/password-reset/request` → `/confirm`
- 3 client flows: returning user (email+pw → OTP → cookies), invited user (invitation_token), new org signup (→ Stripe checkout)
- JWT payload: `{ user_id, org_id, role, email }` — NO wallet_address
- Suspended org → 403 ORG_SUSPENDED on all endpoints except GET /v1/me
- Rate limit: 20 req/min per IP on auth endpoints

**Dependencies:** None
**Effort:** L

---

## E02 — AI Event Logging — Python SDK

**Goal:** Python SDK wrapping `POST /v1/events` with API key auth, error handling, and idempotency.

**Key Acceptance Criteria:**
- `pip install hashira-sdk`; Python 3.9+
- `HashiraClient(api_key).log_event(prompt, output, model_id, timestamp, ...)` → `{ event_id, status }`
- Auto-generated `X-Idempotency-Key` per call
- Error types: HashiraValidationError, HashiraAuthError, HashiraRateLimitError
- SDK does NOT canonicalise or hash (server-only)

**Dependencies:** E03
**Effort:** L

---

## E03 — AI Event Logging — REST API

**Goal:** `POST /v1/events` ingestion endpoint with API key auth, Zod validation, 202 response.

**Key Acceptance Criteria:**
- API key validated: SHA-256 inbound → compare stored hash (constant-time via crypto.timingSafeEqual)
- API key permissions checked: must have `events:write` permission
- org_id from API key — NEVER from request body
- Validation: prompt (1–50k), output (1–100k), model_id (1–100), timestamp (ISO 8601), workflow_id (opt), metadata (max 50 keys, opt)
- 202 Accepted: `{ event_id, status: "processing", received_at }`
- Rate limit: 300/min per API key, burst 50/sec
- `X-Idempotency-Key` honoured

**Dependencies:** E01, E06
**Effort:** M

---

## E04 — Event Canonicalisation & SHA-256 Hashing

**Goal:** Deterministic canonical hash pipeline step.

**Key Acceptance Criteria:**
- Fields included: model_id, output, prompt, timestamp, workflow_id (if non-null), metadata (if non-null)
- Timestamp normalised: `new Date(ts).toISOString()` → always `YYYY-MM-DDTHH:mm:ss.SSSZ`
- Sort all object keys alphabetically (recursive — including nested metadata objects)
- Arrays NOT sorted — element order preserved
- Strip null/undefined fields entirely (don't include with null value)
- JSON.stringify with no whitespace
- SHA-256 via `crypto.createHash('sha256')` → 64-char lowercase hex (NO 0x prefix)
- Stored in `events.canonical_hash` CHAR(64)
- **CRITICAL:** Hash from PLAINTEXT before AES-256 encryption. Never hash ciphertext.
- Byte-for-byte identical output in Node.js and Python for same input
- Dedicated unit tests: determinism, ordering variation, null-stripping, timestamp normalisation

**Dependencies:** E03, E06
**Effort:** S

---

## E05 — Real-Time Blockchain Anchoring

**Goal:** Per-event tx submission to Base L2 via AWS KMS + QuickNode + viem.

**Key Acceptance Criteria:**
- AWS KMS signs tx (ECC secp256k1 key, never leaves KMS)
- QuickNode submits EIP-1559 tx to Base L2; tx data = `0x` + canonical_hash
- Poll for confirmation (configurable depth, default 1 block)
- Exponential backoff retry: `delay = min(1000 * 2^attempt, 30000)ms`, max 3 attempts
- Terminal states: `anchored` (tx_hash, block_number, chain_id, anchored_at written) or `anchor_failed` (anchor_error logged)
- No batching — one tx per event, always
- Anchoring is async (fire-and-forget after event is persisted)

**Dependencies:** E04
**Effort:** XL

---

## E06 — Secure Event Storage

**Goal:** PostgreSQL event persistence with mandatory org isolation and application-layer encryption.

**Key Acceptance Criteria:**
- All 9 tables with correct schema:
  - `organisations` (with stripe fields, subscription_status, user_limit)
  - `users` (with email, password_hash, google_sub, mfa_enabled, totp_secret)
  - `events` (with AES-256 encrypted prompt/output)
  - `api_keys` (with permissions array, key_prefix)
  - `invitations` (with token_hash)
  - `otp_tokens` (with email_hash — SHA-256 of email, not plaintext)
  - `refresh_tokens` (with token_hash)
  - `password_reset_tokens` (with token_hash)
  - `audit_logs` (append-only)
- TypeORM entities for all tables
- org_id mandatory on all event and org-scoped queries
- AES-256 encryption for prompt/output columns (key from AWS Secrets Manager)
- No soft deletes; audit_logs append-only

**Dependencies:** None
**Effort:** M

---

## E07 — Audit Event Search & Filtering API

**Goal:** Paginated event listing with filters.

**Key Acceptance Criteria:**
- `GET /v1/events` with filters: status, date range (from/to), workflow_id, user_id (admin only)
- Pagination: page/page_size (max 100), sort by created_at asc/desc
- Results scoped by org_id (member sees own events; admin sees all org events)
- Response includes decrypted prompt/output (AES-256 decrypted at read time)

**Dependencies:** E06
**Effort:** M

---

## E08 — Verification API & Bundle

**Goal:** Verification payload and downloadable bundle for external auditors.

**Key Acceptance Criteria:**
- `GET /v1/events/:id/verification` — API key auth, returns verification metadata (hash, tx_hash, block_number, chain_id, explorer URL)
- `GET /v1/events/:id/bundle` — JWT auth, downloadable JSON bundle with: event data (decrypted), canonical_event string, canonical_hash, blockchain proof, verification instructions
- Bundle enables independent verification: hash the canonical_event → compare to canonical_hash → check on-chain
- 422 if event not yet anchored

**Dependencies:** E05, E06
**Effort:** M

---

## E09 — Org Onboarding & Stripe

**Goal:** New org creation + Stripe payment activation.

**Key Acceptance Criteria:**
- `POST /v1/organisations { org_name, admin_email, password }` or `{ org_name, google_id_token }`
- INSERT org (payment_pending) + admin user + Stripe Customer + Stripe Checkout session
- Return `{ org_id, stripe_checkout_url }`
- Stripe webhook `checkout.session.completed` → UPDATE org SET status=active
- Additional webhook events: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- `POST /v1/webhooks/stripe` verifies HMAC-SHA256 signature; returns 200 immediately before async processing
- Idempotent processing: Stripe event IDs stored to prevent duplicate handling

**Dependencies:** E01, E06
**Effort:** L

---

## E10 — Organisation Management

**Key Acceptance Criteria:**
- `GET /v1/organisations/:org_id` — get org details (member + admin)
- `PATCH /v1/organisations/:org_id` — update org name (admin only)
- API key CRUD:
  - `POST /v1/organisations/:org_id/api-keys` — generate (hsh_ prefix, SHA-256 stored, plaintext returned once)
  - `GET /v1/organisations/:org_id/api-keys` — list (key_prefix only, never full key)
  - `DELETE /v1/organisations/:org_id/api-keys/:key_id` — revoke (status → revoked, irreversible)

**Effort:** M

---

## E11 — Organisation Membership

**Key Acceptance Criteria:**
- `POST /v1/organisations/:org_id/invitations` — create invitation (admin), checks user_limit
- `GET /v1/organisations/:org_id/invitations` — list invitations (admin), filter by status
- `DELETE /v1/organisations/:org_id/invitations/:id` — revoke pending invitation (admin)
- `GET /v1/organisations/:org_id/members` — list members (admin)
- `PATCH /v1/organisations/:org_id/members/:id` — update role (admin, cannot change own role)
- `DELETE /v1/organisations/:org_id/members/:id` — remove member (admin, cannot remove self)
- Invitation: token is crypto.randomBytes(32) Base64URL; only SHA-256 hash stored in DB; link sent via AWS SES

**Effort:** M

---

## E13, E14 — Super Admin

**Key Acceptance Criteria:**
- `GET /v1/admin/organisations` — list all orgs with search/filter/pagination
- `PATCH /v1/admin/organisations/:org_id` — update user_limit, notes (logged to audit)
- `POST /v1/admin/organisations/:org_id/suspend` — suspend org (requires reason)
- `POST /v1/admin/organisations/:org_id/reactivate` — reactivate suspended org (requires reason)
- `GET /v1/admin/audit-logs` — list audit logs with filters (org, action, date range)
- All super admin actions logged in audit_logs with actor_user_id

**Effort:** M each
