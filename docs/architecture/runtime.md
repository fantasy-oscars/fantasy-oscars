# Runtime Flow

## TL;DR

- Frontend calls the API over HTTP/JSON.
- API owns validation, business logic, and DB access.
- Errors return JSON with HTTP status codes; no leaking stack traces.

## Request lifecycle

1. Client issues HTTP request (JSON in/out).
2. API validates and routes (Express).
3. Data access via Postgres (parameterized queries; migrations applied).
4. Errors surface as JSON with appropriate status; logs capture context.

## Error model

- 4xx for client errors (validation/authz later).
- 5xx for server errors; log full details, return minimal JSON.

## Observability (baseline)

- Console logs for now; promote to structured logs when we add infra.

## Links

- Architecture overview: [overview.md](overview.md)
- Data/migrations: [data.md](data.md)
