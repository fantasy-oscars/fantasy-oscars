# Idea Inbox & Shaping Pipeline

## Purpose

This document defines the canonical location, intent, and promotion pipeline for unstructured ideas within this project. Its goal is to preserve creative throughput without polluting the roadmap, backlog, or planning artifacts.

This file is intentionally non-authoritative. Content here does not imply commitment, priority, or future implementation.

---

## Canonical Location

The Idea Inbox lives at:

docs/ideas/inbox.md

This file is the single canonical dumping ground for raw, unshaped ideas.

Rules:
- Ideas may be incomplete, speculative, or contradictory
- No idea in this file is scheduled work
- No idea in this file may block other work
- No estimates, dependencies, or acceptance criteria are allowed here

If an idea requires rigor, it no longer belongs in the inbox.

---

## Idea Lifecycle Overview

Idea Inbox  →  Shaping Notes  →  Backlog / Roadmap

Each stage has a distinct purpose and contract.

---

## Stage 1: Idea Inbox (Unshaped)

### Intent
Capture thoughts quickly without commitment or overthinking.

### Required Fields
Each idea entry must include:
- Date
- Title
- One-liner description

### Optional Fields
- Why it might matter
- Why it might not
- Related areas of the product
- Open questions

### Explicit Non-Goals
- No scope definition
- No UX decisions
- No technical approach
- No prioritization

Example:

- 2026-01-07 — Nominee Watch Tracking  
  One-liner: Allow users to mark nominees they’ve watched and show completion matrices per league.

---

## Stage 2: Shaping Notes (Evaluated, Not Committed)

### Trigger to Enter Shaping
An idea may move to shaping if:
- It continues to resurface over time
- It aligns with a strategic goal
- It solves a clearly articulated user problem

### Location
Each shaped idea lives in its own file:

docs/ideas/shaping/<idea-name>.md

### Required Content
- Problem statement
- Target users
- Success definition (qualitative)
- Explicit non-goals
- Key tradeoffs and risks

### Still Not Allowed
- Story points
- Sprint assignment
- Engineering task breakdown

Shaping clarifies viability, not schedule.

---

## Stage 3: Backlog / Roadmap (Committed Work)

### Promotion Criteria
An idea may enter the backlog only when:
- Scope is bounded
- Tradeoffs are understood
- Failure modes are acceptable
- The work can be meaningfully estimated

At this point, the idea ceases to exist as an idea and becomes work.

---

## Archival & Cleanup

- Ideas that stagnate may remain indefinitely
- Ideas that are explicitly rejected should be marked as such (do not delete)
- Shaping notes that fail should be archived, not erased

Historical context is valuable.

---

## Guiding Principle

Ideas are cheap.
Planning is expensive.
Commitment is sacred.

This pipeline exists to protect that boundary.
