# Dev Workflows — Hashira Backend

Common scenario-based workflows for the Hashira backend team.

---

## Scenario 1: Starting a Fresh Session

```bash
# 1. Get latest code
git pull

# 2. Open Claude Code in this directory
# -> SessionStart hook runs automatically
# -> STATES.md is read into context
# -> Claude knows current project state

# 3. Verify app runs
npm run start:dev

# 4. Start working — Claude has full context
```

---

## Scenario 2: Picking Up Someone Else's Work

```bash
# 1. Pull latest (includes their STATES.md updates)
git pull

# 2. Open Claude Code
# -> SessionStart hook loads their STATES.md
# -> Check "## Current Status" and "## What's Next"

# 3. If unclear, ask Claude:
# "What did the last session leave off on? What should I do next?"
# -> Claude reads STATES.md and gives you a clear handoff
```

---

## Scenario 3: Implementing an Epic

```bash
# 1. Read the epic in planning/epics.md first
# 2. Check planning/lld-summary.md for TypeScript interfaces
# 3. Tell Claude to use feature-dev workflow:
#    "Use feature-dev workflow to implement E01 (Auth module)"
# -> Claude explores existing code, plans architecture, then implements

# 4. Write tests alongside implementation (TDD preferred)
# 5. Run tests: npm run test
# 6. Run /commit when done with a logical unit
```

---

## Scenario 4: Ending a Session

```bash
# 1. Run /session-handoff
# -> Claude asks: "What's the current status? What's next? Any blockers?"
# -> Updates STATES.md Current Status, What's Next, Open Issues

# 2. Run /commit to commit all work
# -> Claude runs git status, git diff, drafts commit message, commits

# 3. Push (triggers confirmation)
git push

# 4. Close Claude Code
# -> Stop hook runs update-states.sh in background
# -> Captures final git state to STATES.md
```

---

## Scenario 5: Context Getting Full

```bash
# When you see "Context is getting large..." warning:

# Option A: /compact (saves state, then compresses)
# -> PreCompact hook saves git state
# -> Context is compressed
# -> PostCompact hook reloads STATES.md

# Do NOT use /clear — it loses all context without saving
```

---

## Scenario 6: Debugging a Production Issue

```bash
# 1. Tell Claude to use systematic debugging:
#    "Use systematic-debugging to investigate [issue]"

# 2. For blockchain anchoring failures:
#    - Check CloudWatch logs for anchor_error field
#    - Check Base L2 tx hash on Basescan (if tx_hash is set)
#    - Check KMS CloudTrail for signing failures

# 3. Create an ADR in planning/decisions/ if a fix changes architecture
```

---

## Scenario 7: Code Review

```bash
# For PR review using Claude:
# "/review" -> Claude reviews the PR diff

# For security review specifically:
# -> Checks: type safety, org_id enforcement, constant-time comparisons,
#           no plaintext secrets, correct JWT handling, AES-256 encryption order
```

---

## Branch Naming

```
feature/HASH-1234-auth-session   <- epic-based feature
feature/HASH-5678-event-ingestion
fix/jwt-expiry-leak              <- bug fix
chore/update-deps                <- dependency updates
docs/update-states               <- documentation only
```

---

## Commit Message Format

```
feat(auth): Add email+password session endpoint (HASH-12)
fix(events): Fix org_id missing from canonical hash query (HASH-31)
test(anchoring): Add retry logic unit tests (HASH-45)
refactor(api-keys): Extract constant-time comparison to utility
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`
Scopes: `auth`, `events`, `blockchain`, `org`, `admin`, `db`, `api-keys`
