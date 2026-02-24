import { DbClient, query } from "../../db.js";
import type { DraftRecord } from "./types.js";

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
    auto_pick_seed?: string | null;
    auto_pick_config?: Record<string, unknown> | null;
    pick_deadline_at?: Date | null;
    pick_timer_remaining_ms?: number | null;
    allow_drafting_after_lock?: boolean;
    lock_override_set_by_user_id?: number | null;
    lock_override_set_at?: Date | null;
    started_at?: Date | null;
    completed_at?: Date | null;
  }
): Promise<DraftRecord> {
  const { rows } = await query<DraftRecord>(
    client,
    `
      INSERT INTO draft (league_id, season_id, status, draft_order_type, current_pick_number, picks_per_seat, remainder_strategy, total_picks, pick_timer_seconds, auto_pick_strategy, auto_pick_seed, auto_pick_config, pick_deadline_at, pick_timer_remaining_ms, allow_drafting_after_lock, lock_override_set_by_user_id, lock_override_set_at, started_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
        auto_pick_seed,
        auto_pick_config,
        pick_deadline_at,
        pick_timer_remaining_ms::int,
        allow_drafting_after_lock,
        lock_override_set_by_user_id::int,
        lock_override_set_at,
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
      input.auto_pick_seed ?? null,
      input.auto_pick_config ?? null,
      input.pick_deadline_at ?? null,
      input.pick_timer_remaining_ms ?? null,
      input.allow_drafting_after_lock ?? false,
      input.lock_override_set_by_user_id ?? null,
      input.lock_override_set_at ?? null,
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
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

export async function cancelDraftsForCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<Array<{ id: number; season_id: number; status: string }>> {
  const { rows } = await query<{ id: number; season_id: number; status: string }>(
    client,
    `UPDATE draft d
     SET status = 'CANCELLED',
         completed_at = COALESCE(completed_at, now()),
         pick_deadline_at = NULL,
         pick_timer_remaining_ms = NULL
     FROM season s
     WHERE s.id = d.season_id
       AND s.ceremony_id = $1
       AND d.status IN ('PENDING','IN_PROGRESS','PAUSED')
     RETURNING d.id::int, d.season_id::int AS season_id, d.status`,
    [ceremonyId]
  );
  return rows;
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
       d.auto_pick_seed,
       d.auto_pick_config,
       d.pick_deadline_at,
       d.pick_timer_remaining_ms::int,
       d.allow_drafting_after_lock,
       d.lock_override_set_by_user_id::int,
       d.lock_override_set_at,
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
       version::int,
       started_at,
       completed_at
     FROM draft
     WHERE season_id = $1`,
    [seasonId]
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
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
       pick_timer_seconds::int,
       auto_pick_strategy,
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
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
       pick_timer_seconds::int,
       auto_pick_strategy,
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
       version::int,
       started_at,
       completed_at`,
    [draftId, pick_deadline_at, pick_timer_remaining_ms]
  );
  return rows[0] ?? null;
}

export async function setDraftLockOverride(
  client: DbClient,
  draftId: number,
  allow: boolean,
  userId: number
): Promise<DraftRecord | null> {
  const { rows } = await query<DraftRecord>(
    client,
    `UPDATE draft
     SET allow_drafting_after_lock = $2,
         lock_override_set_by_user_id = CASE WHEN $2 THEN $3::int ELSE NULL END,
         lock_override_set_at = CASE WHEN $2 THEN now() ELSE NULL END
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
       auto_pick_seed,
       auto_pick_config,
       pick_deadline_at,
       pick_timer_remaining_ms::int,
       allow_drafting_after_lock,
       lock_override_set_by_user_id::int,
       lock_override_set_at,
       version::int,
       started_at,
       completed_at`,
    [draftId, allow, userId]
  );
  return rows[0] ?? null;
}
