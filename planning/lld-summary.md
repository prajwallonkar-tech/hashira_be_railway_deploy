# LLD Summary — Hashira Backend

**Source:** `planning/lld.md` v1.0 (2026-04-01, updated to reflect TRD v0.8)

This is a curated extract. For full TypeScript interfaces and implementation details, see the full LLD.

---

## Module Structure (Express.js)

```
src/
  config/           # env config (Zod), database datasource
  entities/         # TypeORM entities (one file per table)
  routes/           # Express Router files (one file per domain)
  controllers/      # Thin route handler functions
  services/         # Business logic
  repositories/     # TypeORM query layer (no raw SQL in services)
  middleware/        # Express middleware (authenticate, authorize, validateBody, requestId, errorHandler)
  types/            # Shared TypeScript types, enums, error classes
  utils/            # Pure utility functions (crypto, canonicalization, encryption)
  app.ts            # Express app setup, middleware registration, route mounting
  main.ts           # Entry point — start server, connect DB
```

---

## Backend Services

| Service | Responsibility |
|---------|---------------|
| `EventIngestionService` | Receives POST /v1/events, validates API key, validates payload, assigns UUID, returns 202, hands off to processing |
| `EventProcessingService` | Canonicalizes event, computes SHA-256 hash, AES-256 encrypts prompt/output, persists with status `anchoring`, triggers anchoring |
| `BlockchainAnchoringService` | Signs and submits one on-chain tx per event via AWS KMS + QuickNode; exponential backoff retry; updates status to `anchored` or `anchor_failed` |
| `EventStorageService` | TypeORM repository wrappers for event reads/writes; enforces org_id scoping on every query |
| `AuthService` | Email+password (bcrypt), Google OAuth (JWKS), OTP generation/verification, refresh token rotation, TOTP MFA lifecycle, invited-user provisioning |
| `ApiKeyService` | Generate cryptographically random API keys, store SHA-256 hash, validate inbound keys with constant-time comparison, enforce org status |
| `VerificationService` | Per-event verification metadata and self-contained JSON verification bundles |
| `OrgAdminService` | Org lifecycle (create/update/suspend/reactivate), membership, invitations, user limits; writes all Super Admin actions to audit_logs |
| `StripeWebhookHandler` | Verifies Stripe HMAC signature, routes webhook events to org state transitions |
| `CanonicalisationService` | Pure function: sort keys alphabetically (recursive), strip nulls, ISO 8601 timestamps, JSON.stringify → canonical string → SHA-256 hash |

---

## Key TypeScript Interfaces

### Event

```typescript
interface HashiraEvent {
  event_id: string;          // UUID v4
  org_id: string;            // UUID — mandatory, from API key
  user_id: string;           // UUID — from API key context
  prompt: string;            // 1–50,000 chars (AES-256 encrypted in DB)
  output: string;            // 1–100,000 chars (AES-256 encrypted in DB)
  model_id: string;          // 1–100 chars
  timestamp: Date;           // ISO 8601 UTC
  workflow_id?: string;      // optional, 1–200 chars
  metadata?: Record<string, unknown>; // max 50 keys, JSONB
  canonical_hash: string;    // CHAR(64) — SHA-256, no 0x prefix
  status: EventStatus;
  tx_hash?: string;          // 0x + 64 hex chars
  block_number?: bigint;
  chain_id?: number;
  anchored_at?: Date;
  anchor_error?: string;
  created_at: Date;
}

type EventStatus = 'processing' | 'anchoring' | 'anchored' | 'anchor_failed';
```

### Organisation

```typescript
interface Organisation {
  org_id: string;
  name: string;
  status: OrgStatus;
  user_limit: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_status: SubscriptionStatus;
  created_at: Date;
  updated_at: Date;
}

type OrgStatus = 'payment_pending' | 'active' | 'suspended';
type SubscriptionStatus = 'trialing' | 'active' | 'inactive';
```

### User

```typescript
interface User {
  user_id: string;
  org_id: string | null;     // null for super_admin
  email: string;
  password_hash?: string;    // null for Google-only accounts
  google_sub?: string;       // null for email+password-only accounts
  role: UserRole;
  status: UserStatus;
  mfa_enabled: boolean;
  totp_secret?: string;      // AES-256 encrypted
  totp_secret_pending?: string;
  invited_by?: string;
  created_at: Date;
}

type UserRole = 'member' | 'admin' | 'super_admin';
type UserStatus = 'active' | 'removed';
```

### ApiKey

```typescript
interface ApiKey {
  key_id: string;
  org_id: string;
  key_hash: string;          // CHAR(64) — SHA-256 of plaintext key
  key_prefix: string;        // first 8 chars for display
  status: ApiKeyStatus;
  permissions: string[];     // events:write, events:read, verification:read
  last_used_at?: Date;
  created_at: Date;
}

type ApiKeyStatus = 'active' | 'revoked';
```

### Additional Entities

- **OtpToken** — `{ id, email_hash, otp_hash, expires_at, used, attempts, created_at }`
- **RefreshToken** — `{ id, token_hash, user_id, expires_at, used, created_at }`
- **PasswordResetToken** — `{ token_id, user_id, token_hash, used, expires_at, created_at }`
- **AuditLog** — `{ log_id, actor_user_id, action, target_org_id, target_user_id, payload, created_at }`
- **Invitation** — `{ invitation_id, org_id, invited_by, role, status, token_hash, expires_at, created_at }`

---

## Middleware Stack

```typescript
// Applied to all protected JWT routes:
// 1. requestId       — generate UUID, attach to req/res
// 2. rateLimiter     — per-route or per-router
// 3. authenticate    — validates hashira_session JWT cookie → sets req.user
// 4. authorize(roles) — checks req.user.role against allowed roles
// 5. validateBody    — Zod schema validation for body or query
// 6. route handler
// 7. errorHandler    — global Express error handler (last)
```

### authenticate

```typescript
// 1. Extract JWT from cookies.hashira_session
// 2. jwt.verify(token, JWT_SECRET) — reject if expired or tampered
// 3. Inject: req.user = { user_id, org_id, role, email }
// 4. Check org status — if suspended: throw ForbiddenError('ORG_SUSPENDED')
//    (except GET /v1/me — suspended users can still fetch their own profile)
```

### authenticateApiKey (for POST /v1/events, GET /v1/events/:id/verification)

```typescript
// 1. Extract X-API-Key header
// 2. SHA-256 hash the inbound key
// 3. SELECT api_keys WHERE key_hash = ? AND status = 'active'
// 4. crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(computed))
// 5. Check permissions against required permission for the endpoint
// 6. Fetch org; check org.status === 'active'
// 7. Update last_used_at (fire-and-forget)
// 8. Inject: req.orgContext = { org_id, key_id, permissions }
```

---

## Canonicalisation Algorithm

```typescript
function canonicalise(event: RawEvent): string {
  // 1. Build canonical object — only non-null fields from:
  //    model_id, output, prompt, timestamp, workflow_id, metadata
  const obj: Record<string, unknown> = {
    model_id: event.model_id,
    output: event.output,
    prompt: event.prompt,
    timestamp: new Date(event.timestamp).toISOString(), // normalise to YYYY-MM-DDTHH:mm:ss.SSSZ
  };
  if (event.workflow_id != null) obj.workflow_id = event.workflow_id;
  if (event.metadata != null) obj.metadata = event.metadata;

  // 2. Sort keys alphabetically (recursive — nested objects too)
  // 3. JSON.stringify with no whitespace
  return JSON.stringify(sortKeysRecursive(obj));
}

function hashEvent(canonical: string): string {
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  // Result: 64-char lowercase hex — NO 0x prefix
}
```

---

## Error Architecture

```typescript
// Base: AppError(statusCode, code, message, details?)
// Subclasses: ValidationError(400), AuthError(401|403|410),
//   NotFoundError(404), ConflictError(409),
//   UnprocessableError(422), ServiceUnavailableError(503)
// Global errorHandler middleware catches all + formats response envelope
// TypeORM unique constraint (code 23505) mapped to 409 CONFLICT
```

---

## Response Envelope

```typescript
// Success: { data: T, meta: { request_id } }
// Paginated: { data: T[], pagination: { page, page_size, total, has_next }, meta: { request_id } }
// Error: { error: { code, message, details? }, meta: { request_id } }
```

---

## Auth Flows

### Email + Password (2-step minimum, 3-step with MFA)
1. `POST /v1/auth/session { email, password }` → bcrypt.compare → generate OTP → send via SES → `{ status: "otp_required" }`
2. `POST /v1/auth/otp/verify { email, otp }` → validate OTP hash → if mfa_enabled: `{ status: "mfa_required" }` → else: issue cookies
3. `POST /v1/auth/mfa/verify { email, totp_code }` → validate TOTP → issue cookies (only if mfa_enabled)

### Google OAuth SSO (single-step)
`POST /v1/auth/google { google_id_token }` → verify via Google JWKS → require email_verified=true → issue cookies directly (no OTP)

### Invited User
Same as above but with `invitation_token` parameter → validates invitation → creates user → consumes invitation

### New Org Signup
`POST /v1/organisations { org_name, admin_email, password }` or `{ org_name, google_id_token }` → create org (payment_pending) → create admin user → Stripe checkout → webhook activates org
