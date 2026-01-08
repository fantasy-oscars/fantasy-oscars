# Moderation & Enforcement Standards

## Purpose
This document defines the moderation mechanics, escalation ladder, and signal‑integrity rules that protect the Fantasy Oscars community. It is an internal operational guide for moderators and implementers.

Moderation is implemented as a **distinct cross‑cutting subsystem** that advises human moderators but never acts autonomously.

---

## Moderation Architecture

### Canonical Flow

1. (Optional) Users flag content
2. Moderators decide whether to review
3. System generates **advisory guidance** with justification
4. Moderators take action

The system never enforces automatically.

---

## Incident Classification

### Non‑Counting
- Clarification‑needed (no rule violation)

### Conditional / Weak Signal
- Low‑quality or low‑effort content
- Duplicate or near‑duplicate submissions (single or occasional)

### Counting Incidents
- Rule‑violating (non‑escalatory)
- Escalatory or retaliatory behavior (heavy weight)
- Severe violations (immediate action floor)

---

## Escalation Ladder (Per‑User, Global)

### First Violation
- Content‑level action only

### Second Violation
- Content‑level action + formal warning
- System may recommend restraint based on longitudinal context

### Third Violation
- Content‑level action + temporary posting restriction
- One‑time deferral allowed with system guidance

### Fourth Violation
- Extended restriction or temporary suspension

### Permanent Ban Criteria
- Repeated violations after suspension
- Persistent escalatory or retaliatory behavior
- Severe violation combined with prior history
- Evasion or smurfing

---

## System Guidance Model

- Deterministic, explainable, advisory only
- Considers:
  - Violation density
  - Intervening compliant behavior
  - Contribution volume
  - Time and decay

Guidance frames decisions but never mandates outcomes.

---

## Decay & Recovery

- Recovery is evidence‑driven, not forgiveness‑driven
- High‑signal contributions matter more than time
- Contribution weights:
  - Posts: high signal
  - Comments: medium signal
  - Votes: low signal

Recovery is tiered; no instant reset.

---

## Duplicate Handling & Signal Integrity

### Merge Types

1. **Integrative merge**
   - Credit preserved

2. **Duplicate merge**
   - Credit retroactively set to 0
   - Neutral signal

### Reclassification

- Repeated duplication may be reclassified as:
  - Low‑quality behavior, or
  - Weaponized compliance
- Applies regardless of user tenure or escalation status
- Requires system suspicion + moderator confirmation

---

## Shadow Moderation

- Content or visibility may be restricted without notifying the user
- Used to prevent escalation or abuse loops

---

## Open Questions / Implementation Gaps

- Exact heuristics for duplicate detection (similarity thresholds, clustering)
- Quantitative models for violation density (policy‑level vs code‑level)
- Moderator UI for viewing system guidance and history
- Audit logging and review tooling
- Integration with IP‑based abuse mitigation
- Appeals workflow implementation details

---

## Non‑Goals

- Automated enforcement
- Publicly exposed reputation scores
- Mathematical transparency of internal signals

