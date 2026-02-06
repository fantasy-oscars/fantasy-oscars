# Notifications Policy

This app uses a single, canonical notification taxonomy and a strict routing decision tree to prevent duplicated or inconsistent user messaging.

## Canonical Types (Only These Are Allowed)

A) **Broadcast Banner**
- **Purpose:** ambient/global awareness (“something changed”)
- **Scope:** app-wide or league/season-wide
- **Durability:** persistent until dismissed/expired
- **Must NOT:** ask for confirmation; report success/failure of a user action

B) **Toast**
- **Purpose:** immediate feedback for a user action (“your action worked/failed”)
- **Scope:** local; ephemeral
- **Must NOT:** be stored; be global; be duplicated elsewhere

C) **Inline Alert (Anchored)**
- **Purpose:** local constraints/conditions (“this area has a problem/constraint”)
- **Scope:** specific surface; persists while condition exists
- **Must NOT:** announce asynchronous events

D) **Confirmation Modal**
- **Purpose:** explicit consent for high-cost/irreversible actions (“are you sure?”)
- **Must:** block until decision
- **Must NOT:** communicate outcomes (outcome goes to a Toast, or Inbox/Banner if appropriate)

E) **Inbox Notification (Durable)**
- **Purpose:** durable/reviewable async events (“you might want to know”)
- **Durability:** stored; mark read/dismiss
- **Must NOT:** be time-critical; block progress

F) **Blocking System Alert (Rare)**
- **Purpose:** immediate intervention for critical/session-level/system-level issues
- **Must:** be rare; if common, redesign the flow

## Decision Tree (Routing)

For every user-facing message:

1) **Requires a decision right now?**
- Yes -> **Confirmation Modal** (D) OR **Blocking System Alert** (F) if system-critical
- No -> continue

2) **Immediate feedback for a user action that just happened?**
- Yes -> **Toast** (B)
- No -> continue

3) **Tied to a specific screen/constraint/validation that persists?**
- Yes -> **Inline Alert** (C)
- No -> continue

4) **Relevant later (reviewable) or only ambient now?**
- Later -> **Inbox Notification** (E)
- Ambient now -> **Broadcast Banner** (A)

If two options seem valid, choose the **lower intrusion** surface.

## Duplication Rules

- **One message, one surface.** Do not “toast + banner + inbox” the same event.
- **Allowed pairings only:**
  - Confirmation Modal -> Toast (intent -> outcome)
  - Banner -> Inbox (ambient -> durable) only when truly needed (default is one)
- **Forbidden pairings:**
  - Toast + Inbox for the same event
  - Banner + Toast for the same event
  - Inline Alert + Toast for the same ongoing condition
  - Modal + Banner/Inline/Inbox for the same intent

## Severity Mapping (Guidance)

- **Info:** Banner or Inbox
- **Success:** Toast
- **Warning:** Inline Alert (or Banner if ambient/global)
- **Error:** Toast for action outcome; Inline Alert for persistent/local constraints
- **Critical:** Blocking System Alert (rare)

## Implementation

Frontend policy layer:
- `apps/web/src/notifications/model.ts`: event model
- `apps/web/src/notifications/decisionTree.ts`: routing rules
- `apps/web/src/notifications/notify.ts`: dispatcher
- `apps/web/src/notifications/confirm.tsx`: canonical confirmation modal
- `apps/web/src/notifications/runtimeBanners.tsx`: runtime broadcast/banner stack

Usage:
- Prefer `notify(event)` for all action outcomes, ambient system messages, and durable inbox-class events.
- Prefer `confirm({ title, message, confirmLabel, cancelLabel })` for irreversible actions, then `notify()` for the outcome.
- Inline alerts should be anchored to the surface that owns the constraint/error (e.g. `FormStatus`, `PageError`).

Concrete examples in this app:
- “Invite accepted/declined” -> Toast (B)
- “Draft autopicked due to timer expiry” -> Broadcast Banner (A)
- “Form save failed” -> Inline Alert (C) if the form remains on-screen; Toast (B) if it’s a discrete action outcome
- “Delete ceremony?” -> Confirmation Modal (D), then Toast (B) for success/failure

