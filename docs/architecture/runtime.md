# Runtime Flow

## TL;DR

- Frontend calls the API over HTTP/JSON.
- API owns validation, business logic, and DB access.
- Realtime draft state is delivered over Socket.IO (server-authoritative).
- Errors return JSON with HTTP status codes; no leaking stack traces.

## Request lifecycle

1. Client issues HTTP request (JSON in/out).
2. API validates and routes (Express).
3. Data access via Postgres (parameterized queries; migrations applied).
4. Errors surface as JSON with appropriate status; logs capture context.

## Realtime drafting (Socket.IO)

- The server is the authority for draft state.
- Clients connect to the draft room via Socket.IO and receive:
  - a full snapshot on connect/reconnect
  - incremental events for picks, timer ticks, pause/resume, and lifecycle changes
- Clients should treat snapshots/events as the single source of truth and avoid
  local mutation that could drift from the server.

## Error model

- 4xx for client errors (validation/authz later).
- 5xx for server errors; log full details, return minimal JSON.

## Observability (baseline)

- Console logs for now; promote to structured logs when we add infra.

## Links

- Architecture overview: [overview.md](overview.md)
- Data/migrations: [data.md](data.md)
