# Confluence Pages — Hashira

**Space:** Hashira  
**Base URL:** https://techalchemy.atlassian.net/wiki/spaces/Hashira/overview?homepageId=1785725283

---

## Page Hierarchy

```
Hashira (Space Home)
│
├── Engineering
│   ├── Low Level Design (LLD)
│   │     Full module/service design, TypeScript interfaces, DB schema, middleware
│   ├── Technical Requirements Document (TRD)
│   │     Tech stack, API endpoints, resolved/open decisions
│   ├── Security Specification
│   │     RBAC matrix, threat model, API key handling, org_id enforcement
│   └── Sequence Diagrams
│         Low-level protocol diagrams: SD-01 (returning user) through SD-08
│
├── Product & Backlog
│   ├── Epics
│   │     E01–E20 with acceptance criteria, effort, dependencies
│   └── Stories
│         User stories broken out by epic, with acceptance criteria
│
└── Design & Flows
    ├── Screens
    │     S01–S13 screen specifications with layouts, components, states
    └── User Flows
          Mermaid diagrams: system architecture, 3 auth flows, event lifecycle,
          event status machine, verification flow, role-based navigation
```

---

## Key Pages

| Page | Purpose | When to Reference |
|------|---------|------------------|
| LLD | Full Express.js service design, TypeScript interfaces | Before implementing any module |
| TRD | Tech decisions, API endpoint list | Stack choices, open decisions |
| Security Spec | RBAC, threat model, security controls | Auth, API keys, org isolation |
| Epics | Acceptance criteria for E01–E20 | Before starting any epic |
| Screens | 13 UI screen specs with component details | Frontend implementation |
| User Flows | Auth flow Mermaid diagrams | Auth implementation |

---

## Notes

- Confluence is the **source of truth** for documentation — these pages are maintained by the team (Tech Lead, PM, PO)
- Developers reference Confluence; do not duplicate content here
- If a decision is updated on Confluence, the team will notify via Slack or JIRA
- Local planning files in `planning/` are curated extracts, not live-synced copies
