# Shaping: Minimal Compliance & Responsibility Baseline

## Status
Shaping

## Problem Statement
The app is a publicly accessible web application that collects limited personal data (email addresses, persistent identifiers, in-app activity) and supports user-generated content. Although it is intended for a small, informal community, it may attract a broader audience over time.

Without an explicit compliance and responsibility baseline, decisions about age eligibility, moderation authority, data handling, and user expectations are implicit, inconsistent, and difficult to defend if challenged. This creates unnecessary legal, ethical, and reputational risk for the project owner.

The problem to solve is **how to establish a defensible, good-faith compliance posture without over-engineering or enterprise-level bureaucracy**.

---

## Appetite
Small  
This work should be achievable with lightweight documents, minimal UI affordances, and no major architectural changes.

---

## Constraints
- The app is a hobby-scale project with no current revenue.
- Compliance should be understandable to non-lawyers.
- Policies must be short, readable, and honest.
- The solution should not materially increase user friction.
- The app should remain general-audience and welcoming.

---

## Core Decisions to Make

### 1. Intended Minimum Age
Decide and declare a minimum intended age for users (e.g., 13+, 16+, or 18+), balancing:
- COPPA risk avoidance
- Ethical expectations for general-audience content
- UX friction and perception

This includes:
- Explicit age intent language
- A lightweight age confirmation during registration
- A termination clause for misrepresented age

**Decision: The app is intended for users 13 years of age and older.**

---

### 2. Personal Data Definition & Disclosure
Formally acknowledge what constitutes “personal information” in the context of the app, including:
- Email addresses
- Persistent identifiers (sessions, IPs, etc.)
- In-app activity tied to an account

Decide:
- What is collected
- Why it is collected
- How long it is retained
- How deletion requests are handled

---

### 3. User Expectations & Liability Boundaries
Set clear expectations around:
- Reliability (uptime, data persistence, draft integrity)
- Moderator discretion
- Lack of guarantees

The goal is not legal maximalism, but clarity about what the app does *and does not* promise.

---

### 4. Community Standards & Moderation Authority
Define:
- Basic behavioral expectations for users
- Prohibited content categories
- Moderator powers (removal, warnings, bans)
- Absence of guaranteed appeals

This establishes both ethical norms and legal insulation.

---

### 5. Content Context & Language Disclaimer
Decide how to responsibly frame:
- User-generated content
- Real-world references (film titles, names, quotes)
- Incidental profanity

The app should acknowledge this possibility without positioning itself as adult-oriented or unsafe for minors above the minimum age.

---

### 6. Official vs Unofficial Status
Explicitly clarify that:
- The app is an unofficial fan project
- It is not affiliated with, endorsed by, or sponsored by any awards body or rights holder

This reduces IP confusion and reputational risk.

---

## Out of Scope (Explicitly)
- Enterprise compliance programs (GDPR officers, audits)
- Perfect content filtering
- Age verification beyond intent confirmation
- Support for gambling, wagering, or real-money contests
- Formal legal entity formation

---

## Risks & Tradeoffs

### Risks
- Over-restrictive policies could discourage participation
- Under-specified policies could invite disputes
- Ambiguous age positioning could create COPPA exposure

### Tradeoffs
- Simplicity vs completeness
- Flexibility vs enforceability
- Minimal UX friction vs explicit consent

---

## Definition of Done (Shaping)
This shaping effort is complete when:
- The minimum age is chosen and justified
- The set of required documents is agreed upon
- Each document’s scope and tone is defined
- UI touchpoints (where these are surfaced) are identified
- No unresolved compliance-critical questions remain

At that point, this work is ready to move into planning and implementation.

---

## Follow-On Work (Not Shaped Here)
- Drafting Terms of Service
- Drafting Privacy Policy
- Drafting Code of Conduct
- Adding registration copy and links
- Adding basic reporting or contact mechanism
