# Hashira Backend — Claude Instructions

## Session Start — DO THIS FIRST

**Before responding to anything else**, read these two files:

1. `.claude/STATES.md` — current project state, what's next, open decisions
2. `.claude/project_hashira_be.md` — full architecture reference (modules, DB schema, endpoints, conventions)

Then briefly tell the user: current status + the next task from STATES.md.

## Session End — Auto-trigger

When the user says any of: `done`, `end session`, `session end`, `bye`, `goodbye`, `wrap up`, `that's all`, `closing` — **automatically run `/session-handoff` without being asked**.

---

## Project Overview

Hashira is a multi-tenant SaaS platform that creates cryptographically verifiable, tamper-proof audit records of AI system interactions via real-time blockchain anchoring on Base L2.

---

## Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | TypeScript + **Express.js** on Node.js LTS |
| **Database** | PostgreSQL 16 (Amazon RDS) via **TypeORM** |
| **Auth** | Email + password (bcrypt) · Google OAuth (JWKS/RS256) · OTP via AWS SES · TOTP via otplib |
| **Session** | Hashira JWT HS256 httpOnly cookie (24hr) + rotating refresh token (7-day) |
| **Blockchain** | Base L2 via **QuickNode** RPC + **AWS KMS** signing (viem) |
| **Payments** | **Stripe** (org activation webhook) |
| **Deploy** | AWS ECS Fargate + CloudFront + S3 |

---

## NPM Commands

```bash
npm run start:dev    # dev server with hot reload
npm run build        # TypeScript compile
npm run test         # Jest unit tests
npm run test:e2e     # E2E tests
npm run lint         # ESLint
```

All commands run from the project root.

---

## Library Docs (context7)

Before writing code that uses Express, TypeORM, Zod, or Stripe — use `context7` to pull current docs. These libraries evolve across major versions and training data may be stale.

```
use context7 for express
use context7 for typeorm
use context7 for zod
use context7 for stripe
```

---

## Development Workflow (AI-Augmented)

Follow this order for every feature:

1. **Plan first** — use `superpowers:writing-plans` for any multi-step feature before touching code
2. **TDD** — use `superpowers:test-driven-development`; write `.spec.ts` before the implementation
3. **Implement** — use `feature-dev:feature-dev` for guided implementation with codebase context
4. **Verify** — use `superpowers:verification-before-completion` before claiming done or opening a PR
5. **Review** — use `superpowers:requesting-code-review` before merging

For bugs: use `superpowers:systematic-debugging` before proposing any fix.

---

## Critical Conventions

> These are non-negotiable. Violating any of these is a bug.

1. **org_id MANDATORY** — every DB query must include `org_id` scope in the WHERE clause. Enforce at service layer, not just route guards
2. **No soft deletes** — `audit_logs` is append-only; all other entities use hard deletes
3. **Constant-time API key validation** — use `crypto.timingSafeEqual()`, never string `===`
4. **email from verified token only** — resolve user identity from JWT or Google ID token, never from req.body
5. **SHA-256 canonical hash** — sort keys alphabetically (recursive), strip nulls, ISO 8601 timestamps → 64-char lowercase hex (no 0x prefix)
6. **Plaintext API key never stored/logged** — SHA-256 on receipt, show to user once
7. **No batching** — one blockchain tx per event, always
8. **Suspended org** — return 403 ORG_SUSPENDED on all endpoints except GET /v1/me

---

## Git Workflow

### Branch Structure

| Branch | Purpose |
|--------|---------|
| `dev` | Active development; all feature branches cut from here |
| `testing` | QA environment; merged from `dev` after integration |
| `staging` | Pre-production validation; merged from `testing` |
| `production` | Live environment; only thoroughly tested code lands here |

Merge flow: **`dev` → `testing` → `staging` → `production`**
All merges happen via **pull requests only** — never direct pushes.

### Feature Branches

Cut feature branches off `dev`. Name them:

```
feature/HASH-<ticket-id>-<short-description>
```

Examples: `feature/HASH-1234-auth-module`, `feature/HASH-5678-event-ingestion`

For bug fixes: `fix/<short-description>` (e.g. `fix/jwt-expiry-leak`)

### Pre-commit Hooks (Husky)

Husky runs automatically on every commit:

1. **ESLint** — lint-staged runs ESLint with `--fix` on staged `.ts` files
2. **TypeScript** — `tsc --noEmit` on the full project (no emit, just type-check)

Never bypass hooks with `--no-verify`. Fix the lint/type errors instead.

### Rules

- Always run `git status` + `git diff` before committing
- Use `/commit` skill for commits, `/commit-push-pr` for PRs
- PRs target `dev` (never `testing`, `staging`, or `production` directly)
- Delete feature branches after merge

---

## DO NOT

- `git push --force` or `git push --force-with-lease`
- `git reset --hard`
- `rm -rf` anything
- `git commit --no-verify`
- Commit `.env` files or secrets
- Add soft deletes to any entity
- Add docstrings or comments to unchanged code
- Add error handling for impossible scenarios (trust internal guarantees)
- Add features beyond what was explicitly asked
- Mix raw SQL with TypeORM except where documented

---

## Available Skills (Slash Commands)

### Project Skills
- `/session-handoff` — update STATES.md with session summary (use before ending session)
- `/commit` — stage, review, commit with proper message format
- `/commit-push-pr` — commit + push + open PR targeting `dev`
- `/git-workflow` — gitflow reference: branching, PR targets, environment promotions
- `/test` — run Jest tests (unit, e2e, coverage, watch)
- `/db-migrate` — generate, run, or revert TypeORM migrations
- `/scaffold` — scaffold route/service/repository/middleware with Hashira conventions
- `/plan` → `superpowers:writing-plans` — write plan before multi-step features
- `/verify` → `superpowers:verification-before-completion` — verify before claiming done
- `/debug` → `superpowers:systematic-debugging` — structured debugging before fixing
- `/review` → `superpowers:requesting-code-review` — review before merging
- `/clean_gone` → `commit-commands:clean_gone` — prune local branches deleted on remote

### Installed Plugin Skills
- `superpowers:writing-plans` — write implementation plan before multi-step features
- `superpowers:test-driven-development` — TDD workflow (RED→GREEN→REFACTOR)
- `superpowers:verification-before-completion` — verify before claiming done or opening PR
- `superpowers:systematic-debugging` — structured debugging before proposing fixes
- `superpowers:requesting-code-review` — code review before merging
- `feature-dev:feature-dev` — guided feature implementation (explore→architect→implement)
- `atlassian:search-company-knowledge` — search Jira + Confluence
- `atlassian:triage-issue` — triage bugs into Jira
- `context7` — pull current library docs (Express, TypeORM, Zod, Stripe)

---

## Reference Docs

- `planning/` — epics, stories, LLD summary, security model
- `documentation/confluence-pages.md` — Confluence page hierarchy
- `documentation/jira-board.md` — JIRA board + epics
- `.claude/project_hashira_be.md` — full architecture reference
