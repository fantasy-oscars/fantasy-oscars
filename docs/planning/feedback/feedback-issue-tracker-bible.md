# Feedback & Issue Tracker — Architecture Bible

> Single source of truth for building a transparent, community-facing feedback and issue tracking system with GitHub-backed execution.

---

## 1. Purpose & Philosophy

### Primary goal
Surface, understand, and responsibly respond to **unmet community needs** through a transparent, respectful feedback system.

### Explicit non-goals
- Not a project management or sprint tool
- Not a support ticketing system
- Not a voting leaderboard
- Not a mirror of GitHub Issues

### Core principles
1. Transparency without noise
2. Decision intent ≠ execution reality
3. Promises are explicit; execution is advisory
4. User dignity over gamification
5. Editorial control over derived noise
6. Human judgment over automation

---

## 2. High-Level System Model

### Two-layer model
- **Decision layer (this system):** promises, acceptance, rejection, completion
- **Execution layer (GitHub):** work existence, progress, pauses, closure

**Invariant:** GitHub execution can never silently change a user-facing promise.

---

## 3. Core Entities

### 3.1 Issue
```
Issue {
  id
  title
  description_markdown
  status                  // decision state
  type                    // Bug | Feature Request | Other
  created_by_user_id
  created_at
  updated_at

  active_github_issue_id? // nullable
}
```

### 3.2 Decision Status (persisted)
- New
- Under Consideration
- Planned
- Not Planned
- Completed
- Merged
- Soft Deleted (moderation-only)

### 3.3 Execution State (derived, not persisted)
- Not started
- In development
- Paused
- Done

---

## 4. Status Semantics & Transitions

### Decision-owned transitions
- New → Under Consideration (optional comment)
- Under Consideration → Planned (requires GitHub issue creation; optional comment)
- Under Consideration → Not Planned (optional but encouraged comment)
- Completed / Not Planned → Reopened (maintainer-only, with rationale)

### Derived transitions (from GitHub)
- Planned → In development (issue leaves Todo)
- In development → Planned (issue returns to Todo)
- In development → Done (issue closed)

**Rule:** Derived transitions never require explanation.

---

## 5. Completion Model

- GitHub issue closure auto-marks issue as **Implemented**
- Optional post-close completion note may be added later
- Completion notes are highlighted/pinned if present
- No required confirmation step

---

## 6. GitHub Integration

### Source of truth
- Webhooks are best-effort
- Periodic reconciliation exists
- Temporary staleness is acceptable

### Re-planning behavior
When moving to Planned with an existing closed GitHub issue:
- Prompt maintainer to:
  - Reopen existing issue, or
  - Create a new issue
- Exactly one active GitHub issue at a time

### Conflict rules
- Maintainer intent always wins
- GitHub reopen does not reopen tracker automatically
- Tracker reopen does not mutate GitHub automatically

---

## 7. Activity Feed

### Ordering
- Strict chronological order

### Event types
- User comments (immutable)
- Maintainer comments (highlighted)
- Decision changes (immutable)
- Execution-derived events (editorial)

### Editorial rule
- Only execution-derived events may be hidden or summarized
- Decision events are permanent and visible

---

## 8. Discussion Model

- Flat, chronological comments
- No threading or replies
- @mentions allowed
- Single pinned comment per issue

---

## 9. Voting

- Upvotes only
- Toggleable
- Aggregated across merged issues
- No downvotes or net scoring

---

## 10. Subscriptions & Notifications

### Default subscribers
- Issue creator
- Anyone who comments

### Subscription states
- On
- Off
- Never (sticky)

### Global override
- User may disable all notifications

### Notification triggers
- Status changes
- Maintainer comments
- Merge events
- Completion confirmation

---

## 11. Types & Tags

### Types
- Bug
- Feature Request
- Other (requires free-text subtype, internal only)

### Tags
- Enumerated list + Other
- User-submittable
- Canonical tags curated by moderators
- Discovery-only, no mechanical impact

---

## 12. Discovery & Listing

### Default sort
- Hot (time-decayed vote velocity)
- Status-weighted but inclusive (no filtering)

### Alternate sorts
- Newest
- Most voted
- Recently updated

### Pagination
- 15 items per page
- Pagination (no infinite scroll)

### Row density
- Title
- Type badge
- Status badge
- Subtle vote count

---

## 13. Issue Detail Page

Order:
1. Title
2. Description
3. Activity thread
4. Metadata (type, tags, GitHub link)

---

## 14. Moderation & Roles

### Roles
- User
- Moderator
- Maintainer

### Powers
- Moderators: edit, merge, soft delete
- Maintainers: all moderator powers + decisions + GitHub linkage

### Deletion
- Soft delete only
- Hard delete admin-only, exceptional

---

## 15. Reopening & Merging

- Issues may be reopened by maintainers
- Reopening does not mutate GitHub
- Merged issues:
  - Move to Merged state
  - Votes aggregate into canonical issue
  - Remain visible and linked

---

## 16. Sanity Invariants (Non-Negotiable)

1. Planned always implies an active GitHub issue
2. Derived execution never changes decisions automatically
3. Only execution noise is suppressible
4. Decisions are always visible and auditable
5. Users are never forced into workflows
6. No automation makes promises on behalf of humans

---

## 17. Explicit Future Extensions (Out of Scope)

- Per-user notification tuning UI
- Private issues
- Downvotes or opposition signals
- Advanced search or saved views
- SLA or priority semantics

---

**End of document.**
