# Atomization (Decision / Orchestration / Glue / UI)

This repo follows a strict layering model intended to keep business rules defined once,
workflows explicit, and UI swappable without changing behavior.

Terminology is the same for frontend and backend:

## Decision (pure rules)

- Answers questions like:
  - "Is this valid?"
  - "Can this happen?"
  - "Why not?"
- **No IO** (no network, no DB, no storage, no timers).
- Deterministic: same inputs -> same outputs.
- When FE and BE could disagree, the decision logic belongs in `packages/shared`.

Where it lives:
- Shared: `packages/shared/src/**` (preferred for cross-boundary rules)
- Web-only: `apps/web/src/decisions/**`
- API-only: `apps/api/src/domain/**` (pure rule modules only)

## Orchestration (workflows + IO)

- Owns domain workflows and side effects:
  - calls APIs / DB
  - invokes Decisions
  - manages caching / retries / background refresh
- One orchestration module per user-intent domain (auth, leagues, seasons, drafting, admin ceremonies, etc).
- No nested orchestration: a workflow should not "delegate" to another orchestration as an internal helper.

Where it lives:
- Web: `apps/web/src/orchestration/**`
- API: `apps/api/src/services/**` and `apps/api/src/data/**` (repositories)

## Glue (screen boundary wiring)

- Lives at route/screen boundaries.
- Calls exactly one orchestration.
- Passes data + callbacks into UI components.
- Contains **zero business rules**.
- Router integration is allowed here (reading params, navigating), but the truth/rules still live in Decisions/Orchestration.

Where it lives:
- Web routes: `apps/web/src/pages/**` (and some route layouts)

## UI (rendering only)

- Stateless and ignorant:
  - no API calls
  - no rules
  - no decisions
- Only props + events.
- Mantine components and styling live here.

Where it lives:
- Web: `apps/web/src/screens/**`, `apps/web/src/primitives/**`, `apps/web/src/ui/**`, `apps/web/src/components/**`

## Litmus tests

- Does this file decide something? -> Decision or Orchestration.
- Does this file know why? -> It should not be UI.
- Could we rewrite the UI with no other changes? -> Should be yes.

