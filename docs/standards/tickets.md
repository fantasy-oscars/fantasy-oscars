# Ticket Format Standard

## TL;DR

- Use a consistent issue body structure so readers can skim quickly and dig deeper.
- Keep the top section metadata-only; keep “Contract” and “Acceptance Criteria” explicit.

## Required Sections (in order)

### Metadata

- `Milestone`: the delivery milestone/iteration name.
- `Workstream`: functional area (e.g. Backend/API, Testing Infra).
- `Scope tier`: Must / Should / Could.
- `Blocking`: Yes / No.
- `Risk`: High / Medium / Low.

### Depends On (optional)

- A list of prerequisite issues, using `#123` links when possible.

### Contract

- A short statement of what will be true after completion.

### Acceptance Criteria

- A checklist of verifiable outcomes.
- Prefer criteria that can be confirmed by running commands or inspecting observable behavior.

### Out of Scope (optional but recommended)

- Explicitly list what is not included.

## Notes

- Comments should report progress against acceptance criteria and include the exact commands used for verification.
- Avoid mixing unrelated work into a ticket; create a new ticket when scope diverges.
