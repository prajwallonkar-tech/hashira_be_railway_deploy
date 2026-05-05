# Planning — Hashira Backend

This folder contains pre-development artifacts for the Hashira backend. These are Claude context files — not source code.

## Contents

| File | Description |
|------|-------------|
| `trd.md` | Full Technical Requirements Document v0.8 (gitignored — local reference only) |
| `lld.md` | Full Low Level Design v1.0 (gitignored — local reference only) |
| `epics.md` | All 20 epics (E01–E20) with acceptance criteria, effort estimates, and dependencies |
| `trd-summary.md` | TRD summary: tech stack (Express.js + TypeORM), API surface, decision log |
| `lld-summary.md` | LLD summary: Express.js service design, TypeScript interfaces, middleware stack |
| `security-summary.md` | Security model: RBAC matrix, auth flows, API key handling, org_id enforcement |
| `decisions/` | Architecture Decision Records (ADRs) — add one per major decision |

## Full Reference Docs

The complete documents are on Confluence:

- **LLD:** [Hashira Confluence -> Engineering -> Low Level Design](https://techalchemy.atlassian.net/wiki/spaces/Hashira/overview?homepageId=1785725283)
- **TRD:** [Hashira Confluence -> Engineering -> Technical Requirements](https://techalchemy.atlassian.net/wiki/spaces/Hashira/overview?homepageId=1785725283)
- **Security:** [Hashira Confluence -> Engineering -> Security Spec](https://techalchemy.atlassian.net/wiki/spaces/Hashira/overview?homepageId=1785725283)

## How to Use

- Read `epics.md` to understand scope before starting a feature
- Check `lld-summary.md` for TypeScript interfaces when implementing a service
- Use `trd.md` and `lld.md` (local only) for full implementation detail
- Use `decisions/` to record architectural choices made during implementation

## Note

`trd.md` and `lld.md` are gitignored — they are local reference copies of the full Confluence documents and should not be committed to the repository.
