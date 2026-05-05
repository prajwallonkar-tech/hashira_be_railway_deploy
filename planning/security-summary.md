# Security Summary — Hashira Backend

**Source:** `planning/trd.md` v0.8 + `planning/lld.md` v1.0

---

## RBAC Matrix

| Endpoint Category | member | admin | super_admin |
|------------------|--------|-------|-------------|
| GET /v1/me | ✓ (own) | ✓ (own) | ✓ (own) |
| GET /v1/events | ✓ (own events) | ✓ (all org events) | ✓ (always empty — org_id is NULL) |
| GET /v1/events/:id | ✓ (own) | ✓ (org) | ✗ |
| GET /v1/events/:id/verification | — (API key) | — (API key) | — (API key) |
| GET /v1/events/:id/bundle | ✓ | ✓ | ✗ |
| POST /v1/events | — (API key only) | — | — |
| POST /v1/organisations/:org_id/invitations | ✗ | ✓ | ✗ |
| GET /v1/organisations/:org_id/invitations | ✗ | ✓ | ✗ |
| DELETE /v1/organisations/:org_id/invitations/:id | ✗ | ✓ | ✗ |
| PATCH /v1/organisations/:org_id/members/:id | ✗ | ✓ | ✗ |
| DELETE /v1/organisations/:org_id/members/:id | ✗ | ✓ | ✗ |
| POST/GET/DELETE /v1/organisations/:org_id/api-keys | ✗ | ✓ | ✗ |
| GET /v1/admin/organisations | ✗ | ✗ | ✓ |
| PATCH /v1/admin/organisations/:org_id | ✗ | ✗ | ✓ |
| POST /v1/admin/organisations/:id/suspend | ✗ | ✗ | ✓ |
| POST /v1/admin/organisations/:id/reactivate | ✗ | ✗ | ✓ |
| GET /v1/admin/audit-logs | ✗ | ✗ | ✓ |

---

## Authentication Security

### Email + Password (Two-Step with OTP)

1. **Step 1 — `POST /v1/auth/session`:**
   - bcrypt.compare with cost factor 12
   - Dummy hash ALWAYS run for unknown emails — prevents timing-based email enumeration
   - On success: generate 6-digit OTP → SHA-256 hash → store in `otp_tokens` (10-min expiry, max 5 attempts) → send via AWS SES
   - Return `{ status: "otp_required" }` — NO cookie issued

2. **Step 2 — `POST /v1/auth/otp/verify`:**
   - Validate OTP by SHA-256 hash comparison
   - If user has `mfa_enabled=true`: return `{ status: "mfa_required" }` — still no cookie
   - Else: issue `hashira_session` + `hashira_refresh` cookies

3. **Step 3 (if MFA enrolled) — `POST /v1/auth/mfa/verify`:**
   - Validate TOTP code via `otplib` against stored `totp_secret` (AES-256 decrypted)
   - Issue both cookies

### Google OAuth SSO (Single-Step)

- Verify Google ID token via Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`)
- Require `email_verified=true`
- Lookup user by `google_sub` (stable identifier)
- Issue both cookies directly — NO OTP step for SSO
- JWKS keys cached with 1hr TTL

### JWT (Hashira Session)

- Algorithm: HS256
- Payload: `{ user_id, org_id, role, email, iat, exp }`
- Cookie: `httpOnly; SameSite=Strict; Secure; Max-Age=86400` (24hr)
- Secret: stored in AWS Secrets Manager, never in code/env files
- Validation: `jwt.verify(token, secret)` — rejects if expired or tampered

### Refresh Token (Rotating)

- Cookie: `hashira_refresh` — `httpOnly; SameSite=Strict; Secure; Max-Age=604800` (7-day)
- Token: `crypto.randomBytes(32)` → Base64URL encoded
- Storage: only SHA-256 hash stored in `refresh_tokens` table
- Rotation: on `POST /v1/auth/refresh`, old token marked `used=true`, new token + session JWT issued
- Logout: marks refresh token as `used=true`, clears both cookies with `Max-Age=0`

### TOTP/MFA

- Library: `otplib` (`authenticator`)
- Secret: AES-256 encrypted before storage in `users.totp_secret`
- Enrollment: `/mfa/setup` generates secret → stored in `totp_secret_pending` → `/mfa/confirm` validates first code → copies to `totp_secret` → sets `mfa_enabled=true`
- Disable: requires valid current TOTP code → clears secret → `mfa_enabled=false`

### Password Reset

- `POST /v1/auth/password-reset/request` — ALWAYS returns 200 (prevents email enumeration)
- Token: `crypto.randomBytes(32)` → Base64URL; only SHA-256 hash stored; 1hr expiry; single-use
- `POST /v1/auth/password-reset/confirm` — validates hash, bcrypt hashes new password, marks token used
- 410 GONE if expired or already used
- Only for email+password accounts (password_hash IS NOT NULL)

---

## API Key Security

### Generation

```
plaintext_key = "hsh_" + Base64URL(crypto.randomBytes(32))
key_hash = SHA-256(plaintext_key)   // 64-char hex, stored in DB
key_prefix = plaintext_key.slice(0, 8)  // display only
```

- Plaintext shown to user ONCE on creation — never stored, never logged
- key_hash is the only persistent record

### Validation

```typescript
// On each API-key-authenticated request:
const incomingHash = SHA-256(req.headers['x-api-key']);
const storedHash = Buffer.from(apiKey.key_hash, 'hex');
const computed = Buffer.from(incomingHash, 'hex');
// MUST use timingSafeEqual — never string comparison
if (!crypto.timingSafeEqual(storedHash, computed)) { ... }
```

### Permissions

- Each API key has a `permissions` array: `events:write`, `events:read`, `verification:read`
- Endpoint-to-permission mapping enforced in middleware:
  - `POST /v1/events` → requires `events:write`
  - `GET /v1/events/:id/verification` → requires `verification:read`

### Lockout

- 10 consecutive failures → temporary lockout (in-process counter; post-MVP: Redis)
- Locked keys: 401 on all requests without DB lookup
- Recovery: admin must revoke and create new key

---

## Data Protection

### Application-Layer Encryption (AES-256)

- `prompt` and `output` columns: AES-256 encrypted BEFORE INSERT
- **CRITICAL ORDER:** Canonicalize → SHA-256 hash from PLAINTEXT → AES-256 encrypt → INSERT
- Encryption key: sourced from AWS Secrets Manager — never hardcoded, never in .env
- Decryption: at read time in the service layer (GET /v1/events/:id, bundle generation)

### Token/Secret Storage

| Secret | Storage Method |
|--------|---------------|
| API key | SHA-256 hash only |
| OTP (6-digit) | SHA-256 hash only (email stored as SHA-256 hash too) |
| Refresh token | SHA-256 hash only |
| Password reset token | SHA-256 hash only |
| Invitation token | SHA-256 hash only |
| User password | bcrypt hash (cost 12) |
| TOTP secret | AES-256 encrypted |

### Never Log

- prompt, output, password, password_hash, otp, totp_secret, api_key plaintext, refresh token plaintext

---

## Multi-Tenant Isolation

### org_id Enforcement

Every query that touches org-owned data MUST include org_id in WHERE:

```typescript
// CORRECT
await eventRepo.findOne({ where: { event_id, org_id: req.user.org_id } });

// WRONG — never do this
await eventRepo.findOne({ where: { event_id } });
```

### org_id Source

- JWT-authenticated routes: `org_id` from verified JWT payload (`req.user.org_id`)
- API-key-authenticated routes: `org_id` from validated API key record
- NEVER from `req.body` or `req.params` for security-sensitive lookups

---

## Stripe Webhook Security

```typescript
// Verify Stripe HMAC-SHA256 signature
const event = stripe.webhooks.constructEvent(
  rawBody,                          // raw Buffer, not parsed JSON
  req.headers['stripe-signature'],
  STRIPE_WEBHOOK_SECRET             // from AWS Secrets Manager
);
```

- If signature invalid: 400 (do not process)
- Return 200 immediately before async processing (prevent Stripe retry storms)
- Stripe event IDs stored for idempotency

---

## Blockchain Key Security

- AWS KMS manages the signing key (ECC secp256k1)
- Key NEVER leaves KMS — all signing via KMS API (`kms:Sign`)
- KMS key policy: only ECS task role can invoke `kms:Sign`
- No private key material in environment variables or Secrets Manager

---

## Org Suspension

- Suspended org: **ALL endpoints return 403 ORG_SUSPENDED** except `GET /v1/me`
- `GET /v1/me` still works — user can see their status and org_status
- API key requests for suspended orgs: 403 FORBIDDEN
- Historical data preserved — not deleted
- Frontend: full-width OrgSuspendedBanner

---

## Audit Logging

All super admin actions logged to `audit_logs` (append-only):

```typescript
interface AuditLogEntry {
  log_id: string;
  actor_user_id: string;
  action: string;         // SUSPEND_ORG, REACTIVATE_ORG, UPDATE_ORG, UPDATE_USER_LIMIT, etc.
  target_org_id?: string;
  target_user_id?: string;
  payload: object;        // contextual data (reason, notes, before/after)
  created_at: Date;
}
// No update endpoint. No delete endpoint. Ever.
```

---

## Rate Limits

| Endpoint Group | Limit | Window | Scope |
|----------------|-------|--------|-------|
| Auth endpoints | 20 req/min | per IP | IP-based |
| Failed login | 10 attempts | per email per 5 min | Email-based |
| OTP attempts | 5 attempts | per OTP token | Token-based |
| TOTP attempts | 5 attempts | per login session | Session-based |
| Event logging | 300 req/min (burst 50/sec) | per API key | Key-based |
| Verification | 120 req/min | per API key | Key-based |
| Dashboard reads | 300 req/min | per user JWT | User-based |
| Admin writes | 60 req/min | per user JWT | User-based |
| Super admin | 60 req/min | per user JWT | User-based |
| Stripe webhook | No limit | — | IP allowlist only |
