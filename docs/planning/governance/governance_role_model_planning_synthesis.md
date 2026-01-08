# Governance & Role Model — Planning Synthesis

> **Status:** Planning / Intent Document (Impermanent)
>
> This document captures the agreed governance, role, and domain model for the Fantasy Oscars application. It is intended to guide planning and backlog creation. It is expected to be superseded or deleted once implementation and product documentation exist.

---

## Purpose

This document synthesizes decisions made across moderation design, feedback governance, and role modeling. Its goal is to:

- Establish a shared mental model for authority and responsibility
- Define how governance scales from a tiny team to a larger contributor base
- Prevent role confusion and implicit power creep
- Provide a stable foundation for planning and backlogging

This document does **not** define implementation details, UI, or specific backlog items.

---

## Core Principles

1. **Roles define authority boundaries, not headcount**
   - A single person may hold multiple roles (“multi-hatting”)
   - Roles exist independently of who currently occupies them

2. **Governance is domain-scoped**
   - Authority is delegated by product surface (e.g., Feedback)
   - Domain Stewards own rules and moderation within their domain

3. **Humans decide; systems advise**
   - Moderation and governance actions are always human-initiated
   - Systems provide deterministic, explainable guidance

4. **Code boundaries enforce impact; roles enforce intent**
   - App roles govern decisions
   - Repository ownership and review rules govern code changes

5. **Planning artifacts are impermanent by design**
   - This document is an input to implementation
   - It is not intended to live indefinitely

---

## Role Taxonomy

### Global Roles

#### Product Steward
**Scope:** Entire product

- Owns overall product governance
- Defines which domains exist
- Appoints Domain Stewards
- Final arbiter in cross-domain conflicts
- Can assign or revoke any role

Initially, this role is held by the founders.

---

#### Site Operator
**Scope:** Operational correctness

- Fixes broken or inconsistent state
- Performs manual interventions
- Manages canonical data entry (e.g., nominees, winners)

This role does **not** govern people or policy.

---

#### Product Planner
**Scope:** Planning & prioritization

- Decides which feedback items are planned or not planned
- Assigns work on planned items
- Can edit planned ticket content and status

This role governs *what work happens*, not *how rules are enforced*.

---

### Domain-Scoped Roles

#### Domain Steward (Feedback)
**Scope:** Feedback & idea tracker

- Owns community standards for feedback
- Owns moderation rules and escalation mechanics within the domain
- Appoints and revokes Feedback Moderators
- Resolves feedback-related appeals
- Tunes moderation parameters within agreed bounds

Accountable upward to the Product Steward.

---

#### Feedback Moderator
**Scope:** Feedback tracker content

- Reviews and moderates feedback submissions
- Applies escalation actions
- Merges and reclassifies content
- Acts with system guidance

Moderators enforce rules; they do not define them.

---

### Contextual Roles

#### League Owner
**Scope:** A single league

- Manages league membership and settings
- May have limited league-scoped moderation powers (TBD)

No site-wide authority.

---

#### Participant / Draft Participant
**Scope:** Drafts and leagues

- Participates in drafts
- Submits feedback (subject to gating)

Derived role; not explicitly assigned.

---

## Decision Rights by Area

| Decision Area | Owning Role |
|--------------|------------|
| Community standards (feedback) | Feedback Domain Steward |
| Feedback moderation actions | Feedback Moderator |
| Role assignment (global) | Product Steward |
| Moderator assignment | Feedback Domain Steward |
| Ticket planning / unplanning | Product Planner |
| Ticket merging (duplication) | Feedback Moderator |
| Ticket merging (planning consolidation) | Product Planner |
| Work execution | Developers |
| Canonical Oscars data entry | Site Operator |
| Winner marking / resolution | Site Operator or Product Steward |
| Cross-domain conflicts | Product Steward |

---

## Multi-Hatting Model

- Contributors may hold multiple roles simultaneously
- Actions are attributed to the *role* under which they are taken
- Multi-hatting is expected early and unwound over time as contributors are added

This allows governance structure to exist before staffing exists.

---

## Code Boundary Enforcement

- Domain authority does **not** imply code merge rights
- Code changes are governed by repository ownership and review rules
- Cross-domain changes require appropriate owners from all affected domains

Governance roles decide *what should change*; code ownership decides *what can change*.

---

## Explicitly Deferred Decisions

The following are intentionally out of scope for this document and will be addressed during planning or implementation:

- Exact moderation heuristics and thresholds
- Moderator tooling and dashboards
- Appeals workflow mechanics
- IP-based abuse mitigation details
- Quantitative guidance models
- League-scoped moderation powers

---

## Lifecycle & Retirement

This document should be retired when:

- Moderation and role systems are implemented
- Community standards are migrated to DB-backed content
- Product documentation reflects actual behavior

Deletion or archival of this document is a success condition.

