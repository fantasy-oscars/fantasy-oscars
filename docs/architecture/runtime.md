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

There are two namespaces. Both check the session the same way (`auth/socketSession.ts`: a
Bearer header, the `auth_token` cookie or the handshake `auth` payload, bound to a live
session), then admit the socket to one room.

| Namespace   | Handshake         | Admits                                       | Room and events                                                                                                                                                                                            |
| ----------- | ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/drafts`   | `draftId`         | League members who are in the draft's Season | `draft:<id>`: `draft:event`, ceremony events, `draft:cursor`; reconnect with `GET /drafts/:id/snapshot`                                                                                                    |
| `/circuits` | `circuitLeagueId` | Members of that Circuit league only          | `circuit-league:<id>`: `draft:event` for the league's draft, `waiver:result` after each waiver run, `score:update`, `schedule:update`, `circuit:status`; reconnect with `GET /circuit-drafts/:id/snapshot` |

Both send `draft:event` messages versioned per draft (consecutive `version`s, with
`server_time` for clock skew). A client applies messages newer than its snapshot in order
and fetches a new snapshot when it sees a gap. The Circuit events and payloads are listed
in [circuit.md](circuit.md#the-draft).

## Error model

- 4xx for client errors (validation/authz later).
- 5xx for server errors; log full details, return minimal JSON.

## Observability (baseline)

- Console logs for now; promote to structured logs when we add infra.

## Markdown content

The web client renders Markdown trees and never parses outside the admin editor.
`parseMarkdown` (`packages/shared/src/markdown.ts`, subpath `@fantasy-oscars/shared/markdown`) is the
single parser: remark with GFM, typography rewrites on text nodes, source positions dropped.

- Repo pages (`apps/web/src/content/*.md`): parsed at build time by the `?mdast` import
  (`apps/web/vite/markdownTree.ts`), so the bundle carries the tree.
- Admin-edited content (banners, the landing update): `GET /content/banners` and
  `GET /content/dynamic/:key` return `body_tree` beside `body_markdown`. The API parses on read and
  keeps recent trees in memory, keyed by the source text. Nothing is stored, so there is no column to
  back-fill and no stale tree after a parser change. Admin list and draft routes return markdown only.
- The editor's live preview parses in the browser from a lazily loaded module
  (`features/admin/ui/content/MarkdownPreview.tsx`).

## Links

- Architecture overview: [overview.md](overview.md)
- Data/migrations: [data.md](data.md)
