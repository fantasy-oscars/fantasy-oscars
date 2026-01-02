# Architecture Overview

## TL;DR

- Monorepo with `web` (React), `api` (Express), and Postgres.
- API is the single backend entrypoint; frontend calls it over HTTP/JSON.
- Postgres is the system of record; migrations live in `db/migrations`.

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

- **What’s covered:** current modules and their responsibilities.
- **What’s not:** production infra (to be defined), real auth, realtime.

## Principles

- Prefer conventional, documented approaches; deviations require an ADR.
- Keep a single API boundary; avoid client-to-DB shortcuts.
- Apply migrations automatically in tests; keep DB state isolated.

## Links

- Runtime flow: [architecture/runtime.md](runtime.md)
- Data and migrations: [architecture/data.md](data.md)
