import { type DbClient, query } from "../db.js";

/*
 * Circuit drafts, seats, picks, chips and the draft event log (migrations 029
 * and 030). Called only from services/circuit/circuitDraft.ts, which locks
 * the draft row before it writes picks or moves the clock, and from the
 * draft sweeper's Circuit task for the two read-only clock queries.
 */

export type CircuitDraftRow = {
  id: number;
  circuit_league_id: number;
  status: string;
  draft_type: string;
  rounds: number;
  pick_timer_seconds: number;
  current_pick_number: number | null;
  pick_deadline_at: Date | null;
  version: number;
  started_at: Date | null;
  completed_at: Date | null;
  paused_at: Date | null;
  created_at: Date;
};

export type CircuitDraftSeatRow = {
  seat_number: number;
  member_id: number;
  user_id: number;
  username: string;
};

export type CircuitDraftPickRow = {
  id: number;
  draft_id: number;
  pick_number: number;
  original_pick_number: number;
  seat_number: number;
  member_id: number;
  outcome: "PICKED" | "MISSED";
  selection_id: number | null;
  source: "MANUAL" | "AUTO";
  request_id: string | null;
  actor_user_id: number | null;
  made_at: Date;
};

export type CircuitDraftEventRow = {
  id: number;
  draft_id: number;
  version: number;
  event_type: string;
  payload: unknown;
  created_at: Date;
};

const DRAFT_COLUMNS = `
  d.id::int,
  d.circuit_league_id::int,
  d.status,
  d.draft_type,
  d.rounds,
  d.pick_timer_seconds,
  d.current_pick_number,
  d.pick_deadline_at,
  d.version,
  d.started_at,
  d.completed_at,
  d.paused_at,
  d.created_at`;

const PICK_COLUMNS = `
  p.id::int,
  p.draft_id::int,
  p.pick_number,
  p.original_pick_number,
  p.seat_number,
  p.member_id::int,
  p.outcome,
  p.selection_id::int,
  p.source,
  p.request_id,
  p.actor_user_id::int,
  p.made_at`;

/** Inserts the league's draft, already running at pick 1. */
export async function insertStartedCircuitDraft(
  client: DbClient,
  input: {
    circuit_league_id: number;
    draft_type: string;
    rounds: number;
    pick_timer_seconds: number;
    pick_deadline_at: Date | null;
  }
): Promise<CircuitDraftRow> {
  const { rows } = await query<CircuitDraftRow>(
    client,
    `INSERT INTO circuit_draft AS d
       (circuit_league_id, status, draft_type, rounds, pick_timer_seconds,
        current_pick_number, pick_deadline_at, started_at)
     VALUES ($1, 'IN_PROGRESS', $2, $3, $4, 1, $5, now())
     RETURNING ${DRAFT_COLUMNS}`,
    [
      input.circuit_league_id,
      input.draft_type,
      input.rounds,
      input.pick_timer_seconds,
      input.pick_deadline_at
    ]
  );
  return rows[0]!;
}

/** Seats the members in the given order: the first is seat 1. */
export async function insertCircuitDraftSeats(
  client: DbClient,
  draft: { id: number; circuit_league_id: number },
  memberIdsInSeatOrder: readonly number[]
): Promise<void> {
  await query(
    client,
    `INSERT INTO circuit_draft_seat (draft_id, circuit_league_id, seat_number, member_id)
     SELECT $1, $2, s.ordinality, s.member_id
     FROM unnest($3::bigint[]) WITH ORDINALITY AS s(member_id, ordinality)`,
    [draft.id, draft.circuit_league_id, memberIdsInSeatOrder]
  );
}

export async function getCircuitDraftById(
  client: DbClient,
  id: number,
  opts: { forUpdate?: boolean; forShare?: boolean } = {}
): Promise<CircuitDraftRow | null> {
  const lock = opts.forUpdate ? "FOR UPDATE" : opts.forShare ? "FOR SHARE" : "";
  const { rows } = await query<CircuitDraftRow>(
    client,
    `SELECT ${DRAFT_COLUMNS} FROM circuit_draft d WHERE d.id = $1 ${lock}`,
    [id]
  );
  return rows[0] ?? null;
}

/** The league's one draft, if it has started. */
export async function getCircuitDraftIdByLeague(
  client: DbClient,
  circuitLeagueId: number
): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM circuit_draft WHERE circuit_league_id = $1`,
    [circuitLeagueId]
  );
  return rows[0]?.id ?? null;
}

export async function listCircuitDraftSeats(
  client: DbClient,
  draftId: number
): Promise<CircuitDraftSeatRow[]> {
  const { rows } = await query<CircuitDraftSeatRow>(
    client,
    `SELECT s.seat_number, s.member_id::int, m.user_id::int, u.username
     FROM circuit_draft_seat s
     JOIN circuit_league_member m ON m.id = s.member_id
     JOIN app_user u ON u.id = m.user_id
     WHERE s.draft_id = $1
     ORDER BY s.seat_number`,
    [draftId]
  );
  return rows;
}

export async function listCircuitDraftPicks(
  client: DbClient,
  draftId: number
): Promise<CircuitDraftPickRow[]> {
  const { rows } = await query<CircuitDraftPickRow>(
    client,
    `SELECT ${PICK_COLUMNS} FROM circuit_draft_pick p
     WHERE p.draft_id = $1
     ORDER BY p.pick_number`,
    [draftId]
  );
  return rows;
}

/** The member's earlier pick with this request id, if any. */
export async function getCircuitDraftPickByRequest(
  client: DbClient,
  draftId: number,
  memberId: number,
  requestId: string
): Promise<CircuitDraftPickRow | null> {
  const { rows } = await query<CircuitDraftPickRow>(
    client,
    `SELECT ${PICK_COLUMNS} FROM circuit_draft_pick p
     WHERE p.draft_id = $1 AND p.member_id = $2 AND p.request_id = $3`,
    [draftId, memberId, requestId]
  );
  return rows[0] ?? null;
}

export async function insertCircuitDraftPick(
  client: DbClient,
  input: {
    draft_id: number;
    pick_number: number;
    original_pick_number: number;
    seat_number: number;
    member_id: number;
    outcome: "PICKED" | "MISSED";
    selection_id: number | null;
    source: "MANUAL" | "AUTO";
    request_id: string | null;
    actor_user_id: number | null;
  }
): Promise<CircuitDraftPickRow> {
  const { rows } = await query<CircuitDraftPickRow>(
    client,
    `INSERT INTO circuit_draft_pick AS p
       (draft_id, pick_number, original_pick_number, seat_number, member_id,
        outcome, selection_id, source, request_id, actor_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${PICK_COLUMNS}`,
    [
      input.draft_id,
      input.pick_number,
      input.original_pick_number,
      input.seat_number,
      input.member_id,
      input.outcome,
      input.selection_id,
      input.source,
      input.request_id,
      input.actor_user_id
    ]
  );
  return rows[0]!;
}

/** Sets the draft's status and clock: the next pick, a pause or a resume. */
export async function updateCircuitDraftClock(
  client: DbClient,
  draftId: number,
  input: {
    status: "IN_PROGRESS" | "SUPPLEMENTAL" | "PAUSED";
    current_pick_number: number;
    pick_deadline_at: Date | null;
    paused_at: Date | null;
  }
): Promise<CircuitDraftRow> {
  const { rows } = await query<CircuitDraftRow>(
    client,
    `UPDATE circuit_draft AS d
     SET status = $2, current_pick_number = $3, pick_deadline_at = $4, paused_at = $5
     WHERE d.id = $1
     RETURNING ${DRAFT_COLUMNS}`,
    [
      draftId,
      input.status,
      input.current_pick_number,
      input.pick_deadline_at,
      input.paused_at
    ]
  );
  return rows[0]!;
}

/** Marks the draft complete: no pick is on the clock any more. */
export async function completeCircuitDraft(
  client: DbClient,
  draftId: number
): Promise<CircuitDraftRow> {
  const { rows } = await query<CircuitDraftRow>(
    client,
    `UPDATE circuit_draft AS d
     SET status = 'COMPLETED', completed_at = now(),
         current_pick_number = NULL, pick_deadline_at = NULL
     WHERE d.id = $1
     RETURNING ${DRAFT_COLUMNS}`,
    [draftId]
  );
  return rows[0]!;
}

/** The regular picks that were missed, in original pick order. */
export async function listMissedRegularCircuitDraftPicks(
  client: DbClient,
  draftId: number
): Promise<Array<{ original_pick_number: number; seat_number: number }>> {
  const { rows } = await query<{ original_pick_number: number; seat_number: number }>(
    client,
    `SELECT original_pick_number, seat_number
     FROM circuit_draft_pick
     WHERE draft_id = $1 AND outcome = 'MISSED' AND pick_number = original_pick_number
     ORDER BY original_pick_number`,
    [draftId]
  );
  return rows;
}

/**
 * Of `selectionIds`, those an auto-pick may not take: owned by anyone in the
 * league, or already drafted in this draft.
 */
export async function listUnavailableCircuitDraftSelections(
  client: DbClient,
  input: { circuit_league_id: number; draft_id: number; selection_ids: readonly number[] }
): Promise<number[]> {
  if (input.selection_ids.length === 0) return [];
  const { rows } = await query<{ selection_id: number }>(
    client,
    `SELECT o.selection_id::int
     FROM circuit_ownership o
     WHERE o.circuit_league_id = $1 AND o.released_at IS NULL
       AND o.selection_id = ANY($3::bigint[])
     UNION
     SELECT p.selection_id::int
     FROM circuit_draft_pick p
     WHERE p.draft_id = $2 AND p.selection_id = ANY($3::bigint[])`,
    [input.circuit_league_id, input.draft_id, input.selection_ids]
  );
  return rows.map((r) => r.selection_id);
}

export type CircuitChipRow = {
  id: number;
  circuit_league_id: number;
  member_id: number;
  original_pick_number: number;
  status: string;
  created_at: Date;
};

/** The chip for a supplemental pick that was missed again. */
export async function insertCircuitChip(
  client: DbClient,
  input: { circuit_league_id: number; member_id: number; original_pick_number: number }
): Promise<CircuitChipRow> {
  const { rows } = await query<CircuitChipRow>(
    client,
    `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number)
     VALUES ($1, $2, $3)
     RETURNING id::int, circuit_league_id::int, member_id::int, original_pick_number,
               status, created_at`,
    [input.circuit_league_id, input.member_id, input.original_pick_number]
  );
  return rows[0]!;
}

/** The league's chips, in original pick order. */
export async function listCircuitChips(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitChipRow[]> {
  const { rows } = await query<CircuitChipRow>(
    client,
    `SELECT id::int, circuit_league_id::int, member_id::int, original_pick_number,
            status, created_at
     FROM circuit_chip
     WHERE circuit_league_id = $1
     ORDER BY original_pick_number`,
    [circuitLeagueId]
  );
  return rows;
}

const TIMED_AND_RUNNING = `
  status IN ('IN_PROGRESS', 'SUPPLEMENTAL')
  AND pick_timer_seconds > 0
  AND pick_deadline_at IS NOT NULL`;

/** Running, timed drafts whose deadline has passed, earliest first. */
export async function listExpiredCircuitDraftIds(
  client: DbClient,
  limit: number
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM circuit_draft
     WHERE ${TIMED_AND_RUNNING} AND pick_deadline_at < now()
     ORDER BY pick_deadline_at
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.id);
}

/** Milliseconds until the earliest deadline of a running, timed draft; null when none. */
export async function getNextCircuitDraftDeadlineWaitMs(
  client: DbClient
): Promise<number | null> {
  const { rows } = await query<{ wait_ms: string | number | null }>(
    client,
    `SELECT (EXTRACT(EPOCH FROM (MIN(pick_deadline_at) - now())) * 1000) AS wait_ms
     FROM circuit_draft
     WHERE ${TIMED_AND_RUNNING}`
  );
  const raw = rows[0]?.wait_ms;
  return raw === null || raw === undefined ? null : Number(raw);
}

/** Bumps the draft's version and records the event under the new version. */
export async function appendCircuitDraftEvent(
  client: DbClient,
  draftId: number,
  eventType: string,
  payload: unknown
): Promise<CircuitDraftEventRow> {
  const { rows } = await query<CircuitDraftEventRow>(
    client,
    `WITH bumped AS (
       UPDATE circuit_draft SET version = version + 1
       WHERE id = $1
       RETURNING id, version
     )
     INSERT INTO circuit_draft_event (draft_id, version, event_type, payload)
     SELECT bumped.id, bumped.version, $2, $3::jsonb FROM bumped
     RETURNING id::int, draft_id::int, version, event_type, payload, created_at`,
    [draftId, eventType, JSON.stringify(payload ?? {})]
  );
  return rows[0]!;
}

export async function listCircuitDraftEvents(
  client: DbClient,
  draftId: number
): Promise<CircuitDraftEventRow[]> {
  const { rows } = await query<CircuitDraftEventRow>(
    client,
    `SELECT id::int, draft_id::int, version, event_type, payload, created_at
     FROM circuit_draft_event
     WHERE draft_id = $1
     ORDER BY version`,
    [draftId]
  );
  return rows;
}
