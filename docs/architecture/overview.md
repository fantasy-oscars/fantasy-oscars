# Architecture Overview

## TL;DR

- Monorepo with `web` (React), `api` (Express), and Postgres.
- API is the single backend entrypoint; frontend calls it over HTTP/JSON.
- Postgres is the system of record; migrations live in `db/migrations`.
- Realtime drafting is in production via Socket.IO; admin UI drives ceremony/nominee/winner management.
- Exactly one active ceremony at a time; entering the first winner locks drafting for that ceremony permanently.

## Diagram (context)

```mermaid
flowchart LR
  subgraph Client
    W[Web (React)]
  end

  subgraph Backend
    A[API (Express)]
  end

  subgraph Data
    P[(Postgres)]
  end

  W -- HTTP/JSON --> A
  A -- SQL --> P
```

## Scope

- **Covered:** web (React), api (Express), Postgres, realtime drafting (Socket.IO), admin content entry (active ceremony, nominees upload, winners entry), single-active-ceremony guardrails.
- **Not covered:** production infra topology (Render today, cloud TBD), SSO/OAuth, multi-tenant ceremonies running concurrently.

## Principles

- Prefer conventional, documented approaches; deviations require an ADR.
- Keep a single API boundary; avoid client-to-DB shortcuts.
- Apply migrations automatically in tests; keep DB state isolated.

## Links

- Runtime flow: [architecture/runtime.md](runtime.md)
- Data and migrations: [architecture/data.md](data.md)
- Realtime drafting surface: `apps/api/src/routes/drafts.ts` (Socket.IO gateway) and `apps/web/src/App.tsx` (client)
- Admin surfaces & lock rule: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/ceremony.ts`
- Operational runbook (includes rollover + lock behavior): [../runbooks/operational-runbook.md](../runbooks/operational-runbook.md)
