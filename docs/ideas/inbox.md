# Idea Log

## 2026-01-08 — Nominee Watch Tracking
**One-liner:** Allow users to mark nominees they’ve watched and show completion matrices per league.

**Why it might matter**
- Increases engagement outside draft night
- Creates low-stakes social comparison
- Extends app relevance through Oscar season

**Why it might not**
- Non-draft feature creep
- Requires per-user state + UI density
- Could distract from core fantasy mechanic

**Status:** raw

## 2026-01-08 Defensive Infrastructure

> Status: Context / Guardrails  
> This document captures **expected defensive needs** for the project.
> It is **not a plan**, **not a commitment**, and **not backlogged work**.
> Shaping documents may reference this for assumptions and non-goals.

---

### Purpose

Define a shared understanding of:
- What classes of failure are expected for this project
- What defensive layers are likely required
- Which responsibilities belong to **application code** vs **external services**

This exists to prevent re-litigation during shaping and to avoid premature planning.

---

### Threat & Failure Model (Non-Exhaustive)

The project should assume exposure to:
- Untrusted public internet traffic
- Accidental misuse (double submits, refresh storms)
- Malicious but unsophisticated actors (bots, cheating attempts)
- Client desynchronization during real-time interaction
- Application bugs during live, time-sensitive events

This project does **not** assume:
- Nation-state adversaries
- Handling of financial data
- Handling of sensitive personal data

---

## Defensive Layers

#### 1. Network / Edge Layer (Service-Owned)

**Responsibilities**
- Absorb volumetric traffic
- Filter obvious malicious requests
- Provide TLS termination

**Expected Capabilities**
- CDN
- Web Application Firewall (WAF)
- Basic IP / bot-based rate limiting

**Notes**
- This layer exists to keep garbage away from the app.
- It does not understand application semantics.

---

#### 2. Authentication & Authorization (Application Code)

**Responsibilities**
- Identify users
- Enforce role-based permissions
- Enforce league membership and draft participation rules

**Expectations**
- All mutating actions are authenticated
- Authorization is checked server-side for every action
- Client claims are never trusted

---

#### 3. Server-Authoritative State (Application Code)

**Responsibilities**
- Maintain the canonical draft state
- Validate all proposed actions
- Reject illegal or out-of-order actions

**Principles**
- Clients send *intent*, not state
- Server is the sole authority
- State transitions are explicit and validated

---

#### 4. Real-Time Safety & Correctness (Application Code)

**Responsibilities**
- Prevent double actions
- Handle reconnects safely
- Prevent race conditions

**Expected Mechanisms**
- Idempotent action handling
- Action IDs and/or versioning
- Monotonic state progression
- Duplicate and replay suppression

---

#### 5. Application-Level Rate Limiting (Hybrid)

**Service Layer**
- Coarse IP-based limits

**Application Layer**
- Per-user limits
- Per-league limits
- Per-action limits

**Rationale**
- Only the application understands fairness and legality.

---

#### 6. Data Integrity (Database Layer)

**Responsibilities**
- Enforce invariants regardless of application bugs

**Expectations**
- Foreign keys for all relations
- Uniqueness constraints for draft-critical entities
- NOT NULL constraints on required state
- Database rejects impossible states

---

#### 7. Draft Integrity Controls (Application Code)

**Responsibilities**
- Ensure fairness and clarity during live drafts

**Expected Features**
- Single-action locking (one pick at a time)
- Server-enforced timers
- Explicit draft state machine (e.g. CREATED → LIVE → PAUSED → COMPLETE)
- Recovery on reconnect without corruption

---

#### 8. Observability & Diagnostics (Hybrid)

**Application Code**
- Structured logging
- Request / action IDs
- User and league identifiers in logs

**Services**
- Centralized error tracking
- Alerting for crashes and high error rates

**Goal**
- Fail loudly and visibly, not silently.

---

### Explicit Non-Goals (for Now)

This document does not assume:
- Multi-region availability
- Zero-trust networking
- Custom cryptography
- Penetration testing
- Advanced intrusion detection

These may be revisited if the project scope changes.

## 2026-01-08 Minimal Compliance & Responsibility Baseline for Public-Facing App

### Summary  
Define and implement a **minimal, good-faith compliance and responsibility baseline** for the app that protects the project owner from legal, ethical, and reputational risk while preserving the app’s lightweight, hobby-scale nature. The goal is not exhaustive legal compliance, but a defensible posture grounded in transparency, restraint, and reasonable user expectations.

### Problem / Motivation  
Although the app is intended for a small, informal community, it is publicly accessible and may attract a broader audience over time. Even at small scale, this introduces potential exposure around:

- Collection and storage of personal information (email addresses, persistent identifiers, in-app activity)
- Participation by minors and age-appropriateness expectations
- User-generated content, including the possibility of incidental profanity or offensive language
- Moderation decisions and user disputes
- Intellectual property confusion (official vs unofficial status)
- Reliability expectations for drafts, leagues, and app availability

Without an explicit baseline, these risks are handled implicitly and inconsistently, increasing both legal and ethical ambiguity.

### Proposed Direction  
Establish a small set of explicit, user-facing policies and guardrails that together constitute a “reasonable operator” standard:

- Declare an intended minimum age (e.g., 13+) and include a lightweight age confirmation during registration.
- Publish clear, minimalist Terms of Service and Privacy Policy describing:
  - What data is collected (email, account activity, technical identifiers)
  - Why it is collected
  - How it is used and retained
  - How users can request deletion
- Explicitly state that the app is an unofficial fan project and is not affiliated with or endorsed by any awards body or rights holder.
- Define basic community standards (Code of Conduct) and reserve moderator discretion to remove content or accounts.
- Acknowledge that user-generated and real-world referenced content may occasionally include strong language, without positioning the app as adult-oriented.
- Set expectations around reliability (no guarantees of uptime, data permanence, or draft integrity).

### Non-Goals  
- Full enterprise or regulatory compliance (e.g., formal GDPR programs, accessibility certification).
- Preventing all exposure to offensive language or behavior.
- Guaranteeing perfect moderation or content filtering.
- Supporting gambling, wagering, or real-money contests.

### Signals of Success  
- Users are not surprised by how their data is handled.
- Moderation actions are defensible and grounded in published standards.
- The project owner can credibly demonstrate good-faith effort if challenged.
- The compliance surface remains small, readable, and maintainable.
- The app’s tone remains welcoming and general-audience, not over-restricted or alarmist.

### Notes / Open Questions  
- Whether to choose 13+, 16+, or 18+ as the stated minimum age based on risk tolerance.
- How prominently disclaimers and policies should be surfaced in the UI.
- Whether future features (chat, comments, notifications) require revisiting this baseline.
- At what point (if any) revenue or growth would justify legal review or formal entity formation.
