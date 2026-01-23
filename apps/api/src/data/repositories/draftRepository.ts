import { DbClient, query } from "../db.js";

export type DraftRecord = {
  id: number;
  league_id: number;
  season_id: number;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  draft_order_type: "SNAKE" | "LINEAR";
  current_pick_number: number | null;
  picks_per_seat: number | null;
  remainder_strategy?: "UNDRAFTED" | "FULL_POOL";
  total_picks?: number | null;
  pick_timer_seconds?: number | null;
  auto_pick_strategy?: "NEXT_AVAILABLE" | null;
  pick_deadline_at?: Date | null;
  pick_timer_remaining_ms?: number | null;
  version: number;
  started_at?: Date | null;
  completed_at?: Date | null;
};

export type DraftSeatRecord = {
  id: number;
  draft_id: number;
  league_member_id: number;
  seat_number: number;
  is_active: boolean;
  user_id?: number;
};

export type DraftPickRecord = {
  id: number;
  draft_id: number;
  pick_number: number;
  round_number: number;
  seat_number: number;
  league_member_id: number;
  user_id: number;
  nomination_id: number;
  made_at: Date | null;
  request_id?: string | null;
};

export type DraftEventRecord = {
  id: number;
  draft_id: number;
  version: number;
  event_type: string;
  payload: unknown;
  created_at: Date;
};

export type DraftResultRecord = {
  draft_id: number;
  nomination_id: number;
  won: boolean;
  points: number | null;
  created_at: Date;
  updated_at: Date;
};

export async function createDraft(
  client: DbClient,
  input: {
    league_id: number;
    season_id: number;
    status: DraftRecord["status"];
    draft_order_type: DraftRecord["draft_order_type"];
    current_pick_number?: number | null;
    picks_per_seat?: number | null;
    remainder_strategy?: DraftRecord["remainder_strategy"];
    total_picks?: number | null;
    pick_timer_seconds?: number | null;
    auto_pick_strategy?: DraftRecord["auto_pick_strategy"];
    pick_deadline_at?: Date | null;
    pick_timer_remaining_ms?: number | null;
    started_at?: Date | null;
    completed_at?: Date | null;
  }
): Promise<DraftRecord> {
  const { rows } = await query<DraftRecord>(
    client,
    `
      INSERT INTO draft (league_id, season_id, status, draft_order_type, current_pick_number, picks_per_seat, remainder_strategy, total_picks, pick_timer_seconds, auto_pick_strategy, pick_deadline_at, pick_timer_remaining_ms, started_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING
        id::int,
        league_id::int,
        season_id::int,
        status,
        draft_order_type,
        current_pick_number,
        picks_per_seat::int,
        remainder_strategy,
        total_picks::int,
        pick_timer_seconds::int,
        auto_pick_strategy,
        pick_deadline_at,
        pick_timer_remaining_ms::int,
        version::int,
        started_at,
        completed_at
    `,
    [
      input.league_id,
      input.season_id,
      input.status,
      input.draft_order_type,
      input.current_pick_number ?? null,
      input.picks_per_seat ?? null,
      input.remainder_strategy ?? "UNDRAFTED",
      input.total_picks ?? null,
      input.pick_timer_seconds ?? null,
      input.auto_pick_strategy ?? null,
      input.pick_deadline_at ?? null,
      input.pick_timer_remaining_ms ?? null,
      input.started_at ?? null,
      input.completed_at ?? null
    ]
  );
  return rows[0];
}

export async function getDraftById(
  client: DbClient,
  id: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT
       id::int,
       league_id::int,
       season_id::int,
       status,
       draft_order_type,
       current_pick_number,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       pick_timer_seconds::int,
       auto_pick_strategy,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       version::int,
       started_at,
       completed_at
     FROM draft WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getDraftByIdForUpdate(
  client: DbClient,
  id: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT
       id::int,
       league_id::int,
       season_id::int,
       status,
       draft_order_type,
       current_pick_number,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       pick_timer_seconds::int,
       auto_pick_strategy,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       version::int,
       started_at,
       completed_at
     FROM draft WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateDraftStatus(
  client: DbClient,
  id: number,
  status: DraftRecord["status"]
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return rows[0] ?? null;
}

export async function deleteDraft(client: DbClient, id: number): Promise<void> {
  await query(client, `DELETE FROM draft WHERE id = $1`, [id]);
}

export async function getDraftByLeagueId(
  client: DbClient,
  leagueId: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT
       d.id::int,
       d.league_id::int,
       d.season_id::int,
       d.status,
       d.draft_order_type,
       d.current_pick_number,
       d.picks_per_seat::int,
       d.remainder_strategy,
       d.total_picks::int,
       d.pick_timer_seconds::int,
       d.auto_pick_strategy,
       d.pick_deadline_at,
       d.pick_timer_remaining_ms::int,
       d.version::int,
       d.started_at,
       d.completed_at
     FROM draft d
     JOIN season s ON s.id = d.season_id
     WHERE s.league_id = $1
       AND s.status = 'EXTANT'`,
    [leagueId]
  );
  return rows[0] ?? null;
}

export async function getDraftBySeasonId(
  client: DbClient,
  seasonId: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `SELECT
       id::int,
       league_id::int,
       season_id::int,
       status,
       draft_order_type,
       current_pick_number,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       pick_timer_seconds::int,
       auto_pick_strategy,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       version::int,
       started_at,
       completed_at
     FROM draft
     WHERE season_id = $1`,
    [seasonId]
  );
  return rows[0] ?? null;
}

export async function hasDraftsStartedForCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    client,
    `SELECT EXISTS (
       SELECT 1
       FROM draft d
       JOIN season s ON s.id = d.season_id
       WHERE s.ceremony_id = $1
         AND d.status <> 'PENDING'
     ) AS exists`,
    [ceremonyId]
  );
  return Boolean(rows[0]?.exists);
}

export async function countNominationsByCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE ce.ceremony_id = $1`,
    [ceremonyId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function getNominationByIdForCeremony(
  client: DbClient,
  nominationId: number,
  ceremonyId: number
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT n.id::int
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE n.id = $1 AND ce.ceremony_id = $2`,
    [nominationId, ceremonyId]
  );
  return rows[0] ?? null;
}

export async function updateDraftOnStart(
  client: DbClient,
  id: number,
  current_pick_number: number,
  started_at: Date,
  picks_per_seat: number,
  remainder_strategy: DraftRecord["remainder_strategy"],
  total_picks: number,
  pick_timer_seconds: number | null,
  auto_pick_strategy: DraftRecord["auto_pick_strategy"],
  pick_deadline_at: Date | null,
  pick_timer_remaining_ms: number | null
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'IN_PROGRESS',
         current_pick_number = $2,
         started_at = $3,
         picks_per_seat = $4,
         remainder_strategy = $5,
         total_picks = $6,
         pick_timer_seconds = $7,
         auto_pick_strategy = $8,
         pick_deadline_at = $9,
         pick_timer_remaining_ms = $10
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       pick_timer_seconds::int,
       auto_pick_strategy,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       version::int,
       started_at,
       completed_at`,
    [
      id,
      current_pick_number,
      started_at,
      picks_per_seat,
      remainder_strategy,
      total_picks,
      pick_timer_seconds,
      auto_pick_strategy,
      pick_deadline_at,
      pick_timer_remaining_ms
    ]
  );
  return rows[0] ?? null;
}

export async function countDraftSeats(
  client: DbClient,
  draftId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM draft_seat WHERE draft_id = $1`,
    [draftId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function countNominations(client: DbClient): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM nomination`
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function listDraftSeats(
  client: DbClient,
  draftId: number
): Promise<DraftSeatRecord[]> {
  const { rows } = await query<DraftSeatRecord>(
    client,
    `SELECT
       ds.id::int,
       ds.draft_id::int,
       ds.league_member_id::int,
       ds.seat_number::int,
       ds.is_active,
       lm.user_id::int AS user_id
     FROM draft_seat ds
     JOIN league_member lm ON lm.id = ds.league_member_id
     WHERE ds.draft_id = $1
     ORDER BY ds.seat_number ASC`,
    [draftId]
  );
  return rows;
}

export async function createDraftSeats(
  client: DbClient,
  input: { draft_id: number; league_member_ids_in_order: number[] }
): Promise<DraftSeatRecord[]> {
  if (input.league_member_ids_in_order.length === 0) return [];
  const values = input.league_member_ids_in_order
    .map((id, idx) => `($1, ${idx + 1}, ${id})`)
    .join(", ");
  const { rows } = await query<DraftSeatRecord>(
    client,
    `INSERT INTO draft_seat (draft_id, seat_number, league_member_id)
     VALUES ${values}
     ON CONFLICT DO NOTHING
     RETURNING
       id::int,
       draft_id::int,
       league_member_id::int,
       seat_number::int,
       is_active`,
    [input.draft_id]
  );
  return rows;
}

export async function listDraftPicks(
  client: DbClient,
  draftId: number
): Promise<DraftPickRecord[]> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at
     FROM draft_pick
     WHERE draft_id = $1
     ORDER BY pick_number ASC`,
    [draftId]
  );
  return rows;
}

export async function listDraftResults(
  client: DbClient,
  draftId: number
): Promise<DraftResultRecord[]> {
  const { rows } = await query<DraftResultRecord>(
    client,
    `SELECT
       draft_id::int,
       nomination_id::int,
       won,
       points,
       created_at,
       updated_at
     FROM draft_result
     WHERE draft_id = $1
     ORDER BY nomination_id ASC`,
    [draftId]
  );
  return rows;
}

export async function listNominationIds(
  client: DbClient,
  nominationIds: number[]
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM nomination WHERE id = ANY($1)`,
    [nominationIds]
  );
  return rows.map((row) => row.id);
}

export async function listNominationIdsByCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT n.id::int
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     WHERE ce.ceremony_id = $1
     ORDER BY n.id ASC`,
    [ceremonyId]
  );
  return rows.map((row) => row.id);
}

export async function upsertDraftResults(
  client: DbClient,
  draftId: number,
  results: Array<{ nomination_id: number; won: boolean; points: number | null }>
): Promise<void> {
  if (results.length === 0) return;
  for (const result of results) {
    await query(
      client,
      `INSERT INTO draft_result (draft_id, nomination_id, won, points)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (draft_id, nomination_id)
       DO UPDATE SET won = EXCLUDED.won, points = EXCLUDED.points, updated_at = now()`,
      [draftId, result.nomination_id, result.won, result.points]
    );
  }
}

export async function countDraftPicks(
  client: DbClient,
  draftId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    client,
    `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
    [draftId]
  );
  return rows[0]?.count ? Number(rows[0].count) : 0;
}

export async function getPickByNumber(
  client: DbClient,
  draftId: number,
  pickNumber: number
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT * FROM draft_pick WHERE draft_id = $1 AND pick_number = $2`,
    [draftId, pickNumber]
  );
  return rows[0] ?? null;
}

export async function getPickByNomination(
  client: DbClient,
  draftId: number,
  nominationId: number
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT * FROM draft_pick WHERE draft_id = $1 AND nomination_id = $2`,
    [draftId, nominationId]
  );
  return rows[0] ?? null;
}

export async function getNominationById(
  client: DbClient,
  nominationId: number
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `SELECT id::int FROM nomination WHERE id = $1`,
    [nominationId]
  );
  return rows[0] ?? null;
}

export async function insertDraftPickRecord(
  client: DbClient,
  input: {
    draft_id: number;
    pick_number: number;
    round_number: number;
    seat_number: number;
    league_member_id: number;
    user_id: number;
    nomination_id: number;
    made_at: Date;
    request_id?: string | null;
  }
): Promise<DraftPickRecord> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `INSERT INTO draft_pick
     (draft_id, pick_number, round_number, seat_number, league_member_id, user_id, nomination_id, made_at, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at,
       request_id`,
    [
      input.draft_id,
      input.pick_number,
      input.round_number,
      input.seat_number,
      input.league_member_id,
      input.user_id,
      input.nomination_id,
      input.made_at,
      input.request_id ?? null
    ]
  );
  return rows[0];
}

export async function getPickByRequestId(
  client: DbClient,
  draftId: number,
  requestId: string
): Promise<DraftPickRecord | null> {
  const { rows } = await query<DraftPickRecord>(
    client,
    `SELECT
       id::int,
       draft_id::int,
       pick_number::int,
       round_number::int,
       seat_number::int,
       league_member_id::int,
       user_id::int,
       nomination_id::int,
       made_at,
       request_id
     FROM draft_pick
     WHERE draft_id = $1 AND request_id = $2`,
    [draftId, requestId]
  );
  return rows[0] ?? null;
}

export async function updateDraftCurrentPick(
  client: DbClient,
  draftId: number,
  nextPickNumber: number | null
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET current_pick_number = $2
     WHERE id = $1
     RETURNING *`,
    [draftId, nextPickNumber]
  );
  return rows[0] ?? null;
}

export async function updateDraftOnComplete(
  client: DbClient,
  draftId: number,
  completedAt: Date
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'COMPLETED',
         completed_at = $2,
         current_pick_number = NULL
     WHERE id = $1
     RETURNING id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number::int,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       version::int,
       started_at,
       completed_at`,
    [draftId, completedAt]
  );
  return rows[0] ?? null;
}

export async function completeDraftIfReady(
  client: DbClient,
  draftId: number,
  completedAt: Date,
  requiredPickCount: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET status = 'COMPLETED',
         completed_at = $2,
         current_pick_number = NULL
     WHERE id = $1
       AND status <> 'COMPLETED'
       AND (SELECT COUNT(*) FROM draft_pick WHERE draft_id = $1) >= $3
     RETURNING id::int,
       league_id::int,
       status,
       draft_order_type,
       current_pick_number::int,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       version::int,
       started_at,
       completed_at`,
    [draftId, completedAt, requiredPickCount]
  );
  return rows[0] ?? null;
}

export async function incrementDraftVersion(
  client: DbClient,
  draftId: number
): Promise<number> {
  const { rows } = await query<{ version: number }>(
    client,
    `UPDATE draft
     SET version = version + 1
     WHERE id = $1
     RETURNING version::int`,
    [draftId]
  );
  return rows[0]?.version ?? 0;
}

export async function updateDraftTimer(
  client: DbClient,
  draftId: number,
  pick_deadline_at: Date | null,
  pick_timer_remaining_ms: number | null
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET pick_deadline_at = $2,
         pick_timer_remaining_ms = $3
     WHERE id = $1
     RETURNING
       id::int,
       league_id::int,
       season_id::int,
       status,
       draft_order_type,
       current_pick_number,
       picks_per_seat::int,
       remainder_strategy,
       total_picks::int,
       pick_timer_seconds::int,
       auto_pick_strategy,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       version::int,
       started_at,
       completed_at`,
    [draftId, pick_deadline_at, pick_timer_remaining_ms]
  );
  return rows[0] ?? null;
}

export async function insertDraftEvent(
  client: DbClient,
  input: {
    draft_id: number;
    version: number;
    event_type: string;
    payload: unknown;
  }
): Promise<DraftEventRecord> {
  const { rows } = await query<DraftEventRecord>(
    client,
    `INSERT INTO draft_event (draft_id, version, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING
       id::int,
       draft_id::int,
       version::int,
       event_type,
       payload,
       created_at`,
    [input.draft_id, input.version, input.event_type, JSON.stringify(input.payload ?? {})]
  );
  return rows[0];
}

export async function createDraftEvent(
  client: DbClient,
  input: {
    draft_id: number;
    event_type: string;
    payload: unknown;
  }
): Promise<DraftEventRecord> {
  const version = await incrementDraftVersion(client, input.draft_id);
  return insertDraftEvent(client, {
    draft_id: input.draft_id,
    version,
    event_type: input.event_type,
    payload: input.payload
  });
}
