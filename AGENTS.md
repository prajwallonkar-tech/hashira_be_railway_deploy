# Hashira Backend — Agent Rules

Rules specific to AI agent behaviour in this repository.

---

## Framework

**This is an Express.js project — NOT NestJS.**

- Use plain Express middleware, Router, and service patterns
- No NestJS decorators, modules, DI container, or pipes
- Organise code by domain: `routes/`, `controllers/`, `services/`, `repositories/`
- Use Zod for request validation via `validateBody` middleware
- Use `authenticate` and `authorize` middleware for auth and RBAC

## Database

**TypeORM is the ORM — no raw SQL unless documented exception.**

- All entities use `@Entity()` decorator with explicit column definitions
- Relationships: `@ManyToOne`, `@OneToMany`, `@OneToOne` with explicit foreign keys
- Repositories are standalone classes injected into services
- **Every query must scope by org_id** — if you write a query without a WHERE org_id = :orgId, it is wrong

## Security — Non-Negotiable

- **org_id scope on every query** — this is the multi-tenant isolation mechanism
- **constant-time API key comparison** — `crypto.timingSafeEqual()` only
- **email from verified token only** — never from req.body for identity resolution
- **No plaintext secrets in code or logs** — use AWS Secrets Manager
- **All auth failures logged** — but no PII (no email, password, OTP, TOTP secret in logs)
- **AES-256 encryption order** — canonicalize → SHA-256 hash from PLAINTEXT → encrypt prompt/output → INSERT

## Blockchain

- Anchoring is **real-time per-event** — one tx per event, no batching, ever
- KMS signing key **never leaves KMS** — all signing happens via KMS API
- QuickNode is the RPC provider for Base L2
- Event statuses follow exact machine: processing → anchoring → anchored | anchor_failed

## Response Format

All API responses use the envelope format:

```typescript
{
  data: T,
  meta: {
    request_id: string,
    [key: string]: unknown
  }
}
```

Error responses:

```typescript
{
  error: {
    code: string,      // e.g. "ORG_SUSPENDED", "VALIDATION_ERROR"
    message: string,
    details?: unknown[] // field-level errors for validation
  },
  meta: {
    request_id: string
  }
}
```

## Testing

- Unit tests live alongside source files (`*.spec.ts`)
- E2E tests in `test/` directory
- Mock external services (AWS KMS, QuickNode, Stripe) in unit tests
- Use real PostgreSQL in E2E tests (never mock the DB for E2E)
- Canonical hash determinism must have dedicated unit tests

## What Agents Must NOT Do

- Introduce raw SQL without explicit team approval
- Skip org_id scope on ANY query
- Use string equality for API key comparison
- Batch blockchain transactions
- Add soft deletes
- Store or log plaintext API keys, OTPs, passwords, or secrets
- Use `any` in TypeScript without a documented reason
- Use NestJS patterns (decorators, modules, DI container, pipes, guards)
