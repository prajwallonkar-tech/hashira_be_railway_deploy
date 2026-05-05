# Claude Code Setup — Hashira Backend

This document explains how the Claude Code AI-augmented development setup works for the Hashira backend.

---

## Overview

The `.claude/` folder contains everything Claude Code needs to understand this project and maintain context across sessions and developers.

```
.claude/
├── settings.json          <- permissions + hooks (committed, shared)
├── settings.local.json    <- local overrides (gitignored)
├── .mcp.json              <- MCP server configs (Atlassian + context7)
├── STATES.md              <- live project state (auto-updated)
├── MEMORY.md              <- index of reference files
├── project_hashira_be.md  <- architecture reference (read at session start)
├── DEV_CHECKLIST.md       <- new dev onboarding
├── scripts/               <- hook scripts
└── skills/                <- slash command definitions
```

---

## How Hooks Work

### SessionStart -> `session-start-check.sh`

Runs automatically when Claude Code opens this project. It:

1. Checks Node.js, npm, git are installed
2. Prints current git branch + last commit
3. Reads and prints `STATES.md` into Claude's context
4. Reminds Claude to read `project_hashira_be.md`

**Effect:** Claude knows exactly where you are in the project without you having to re-explain.

### Stop -> `update-states.sh`

Runs in the background when Claude Code stops. It:

1. Captures current git branch, last 3 commits, git status, diff stat
2. Overwrites the auto-updated sections of `STATES.md` (Last Session, Recent Commits, Uncommitted Changes)
3. Preserves the manual sections (Current Status, What's Next, etc.)

**Effect:** The next developer (or next session) opens to a STATES.md that shows exactly what git state was left behind.

### PreCompact -> `pre-compact.sh`

Runs before Claude compacts the context window (`/compact`). Saves git state before context is compressed.

### PostCompact -> `post-compact.sh`

Runs after compaction. Prints STATES.md to reload Claude's context after compression.

---

## STATES.md Structure

```
## Current Status        <- 2-4 sentence summary (MANUAL — you update this)
## What's Next           <- ordered task list (MANUAL — keep updated)
## Open Issues / Blockers <- half-done work or external dependencies (MANUAL)
## Key Decisions Made    <- architectural choices (MANUAL — append, never delete)
## Last Session          <- timestamp + branch + commit (AUTO — don't edit)
## Recent Commits        <- last 3 commits (AUTO)
## Uncommitted Changes   <- git status + diff stat (AUTO)
```

**Rule:** Update the manual sections at the end of each session using `/session-handoff`.

---

## Session Handoff Workflow

```
Developer 1 (ending session):
  1. /session-handoff -> update STATES.md Current Status, What's Next
  2. /commit -> commit all work
  3. git push

Developer 2 (starting session):
  1. git pull
  2. Open Claude Code -> SessionStart hook auto-reads STATES.md
  3. Claude already knows what was done and what's next
```

---

## MCP Servers

Two MCP servers are configured in `.claude/.mcp.json`:

### Atlassian (Jira + Confluence)

Lets Claude read and interact with:
- Confluence pages (LLD, TRD, Security, Screens, User Flows)
- JIRA tickets and boards

Usage: "Check the Confluence LLD for the Auth service TypeScript interface"

### context7

Pulls current library documentation on demand:
- Express, TypeORM, Zod, Stripe, viem, AWS SDK
- Usage: "@context7 show Express middleware documentation"

---

## Available Slash Commands

| Command | What it does |
|---------|-------------|
| `/session-handoff` | Update STATES.md with qualitative session summary |
| `/commit` | Stage -> review -> commit with proper message format |
| `/commit-push-pr` | Commit + push + open GitHub PR |

---

## Plugins Required

Ensure these Claude Code plugins are installed:

- `superpowers` — brainstorming, TDD, debugging, planning skills
- `feature-dev` — guided feature implementation workflow
- `commit-commands` — `/commit`, `/commit-push-pr`
- `atlassian` — Jira + Confluence (if not using .mcp.json)
- `context7` — library docs
- `claude-mem` — cross-session memory
