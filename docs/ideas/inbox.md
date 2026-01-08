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

### Defensive Layers

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
**2026-01-08: moved to shaping** [compliance-baseline.md](./shaping/compliance-baseline.md)