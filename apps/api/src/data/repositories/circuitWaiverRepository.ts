import { type DbClient, query } from "../db.js";
import type { WaiverPriority } from "../../domain/circuitWaivers.js";

/*
 * Circuit waiver claims, runs, rolling priority and chips (migrations 030
 * and 031). Claim writes come from services/circuit/circuitWaivers.ts after
 * it has share-locked the league row and locked the claimant's member row.
 */

export type CircuitWaiverClaimStatus = "PENDING" | "WON" | "LOST" | "WITHDRAWN";

export type CircuitWaiverClaimRow = {
  id: number;
  circuit_league_id: number;
  member_id: number;
  /** `YYYY-MM-DD`. */
  window_starts_on: string;
  selection_id: number;
  drop_selection_id: number | null;
  chip_id: number | null;
  rank: number;
  status: CircuitWaiverClaimStatus;
  failure_reason: string | null;
  run_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type CircuitMemberChipRow = {
  id: number;
  original_pick_number: number;
  status: string;
  /** The pending claim the chip is attached to, if any. */
  claim_id: number | null;
};

export type CircuitLeagueChipRow = {
  id: number;
  user_id: number;
  username: string;
  original_pick_number: number;
  status: string;
};

export type CircuitWaiverPriorityRow = {
  member_id: number;
  user_id: number;
  username: string;
  waiver_priority: number | null;
};

const CLAIM_COLUMNS = `
  c.id::int,
  c.circuit_league_id::int,
  c.member_id::int,
  c.window_starts_on::text,
  c.selection_id::int,
  c.drop_selection_id::int,
  c.chip_id::int,
  c.rank,
  c.status,
  c.failure_reason,
  c.run_id::int,
  c.created_at,
  c.updated_at`;

/**
 * Locks a member's claims for the rest of the transaction, so their ranks
 * are assigned and rewritten one write at a time.
 */
export async function lockCircuitWaiverClaimant(
  client: DbClient,
  memberId: number
): Promise<void> {
  await query(client, `SELECT 1 FROM circuit_league_member WHERE id = $1 FOR UPDATE`, [
    memberId
  ]);
}

/** Whether the processor has started (or finished) the league's window. */
export async function hasCircuitWaiverRun(
  client: DbClient,
  circuitLeagueId: number,
  windowStartsOn: string
): Promise<boolean> {
  const { rows } = await query(
    client,
    `SELECT 1 FROM circuit_waiver_run
     WHERE circuit_league_id = $1 AND window_starts_on = $2::date`,
    [circuitLeagueId, windowStartsOn]
  );
  return rows.length > 0;
}

/** A member's claims in a window, withdrawn ones left out, by rank. */
export async function listCircuitWaiverClaimsForMember(
  client: DbClient,
  memberId: number,
  windowStartsOn: string
): Promise<CircuitWaiverClaimRow[]> {
  const { rows } = await query<CircuitWaiverClaimRow>(
    client,
    `SELECT ${CLAIM_COLUMNS}
     FROM circuit_waiver_claim c
     WHERE c.member_id = $1 AND c.window_starts_on = $2::date
       AND c.status <> 'WITHDRAWN'
     ORDER BY c.rank, c.id`,
    [memberId, windowStartsOn]
  );
  return rows;
}

/** One of a member's claims; null when it is someone else's or missing. */
export async function getCircuitWaiverClaimForMember(
  client: DbClient,
  memberId: number,
  claimId: number
): Promise<CircuitWaiverClaimRow | null> {
  const { rows } = await query<CircuitWaiverClaimRow>(
    client,
    `SELECT ${CLAIM_COLUMNS}
     FROM circuit_waiver_claim c
     WHERE c.member_id = $1 AND c.id = $2`,
    [memberId, claimId]
  );
  return rows[0] ?? null;
}

/** Adds a pending claim at the bottom of the member's ranking for the window. */
export async function insertCircuitWaiverClaim(
  client: DbClient,
  input: {
    circuit_league_id: number;
    member_id: number;
    window_starts_on: string;
    selection_id: number;
    drop_selection_id: number | null;
    chip_id: number | null;
  }
): Promise<CircuitWaiverClaimRow> {
  const { rows } = await query<CircuitWaiverClaimRow>(
    client,
    `INSERT INTO circuit_waiver_claim AS c
       (circuit_league_id, member_id, window_starts_on, selection_id,
        drop_selection_id, chip_id, rank)
     SELECT $1, $2, $3::date, $4, $5, $6, COALESCE(MAX(p.rank), 0) + 1
     FROM (
       SELECT rank FROM circuit_waiver_claim
       WHERE member_id = $2 AND window_starts_on = $3::date AND status = 'PENDING'
     ) p
     RETURNING ${CLAIM_COLUMNS}`,
    [
      input.circuit_league_id,
      input.member_id,
      input.window_starts_on,
      input.selection_id,
      input.drop_selection_id,
      input.chip_id
    ]
  );
  return rows[0]!;
}

/** Sets a pending claim's conditional drop and chip. */
export async function updateCircuitWaiverClaim(
  client: DbClient,
  claimId: number,
  input: { drop_selection_id: number | null; chip_id: number | null }
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_waiver_claim
     SET drop_selection_id = $2, chip_id = $3, updated_at = now()
     WHERE id = $1 AND status = 'PENDING'`,
    [claimId, input.drop_selection_id, input.chip_id]
  );
}

/** Withdraws a pending claim, freeing its selection key and its chip. */
export async function withdrawCircuitWaiverClaim(
  client: DbClient,
  claimId: number
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_waiver_claim
     SET status = 'WITHDRAWN', updated_at = now()
     WHERE id = $1 AND status = 'PENDING'`,
    [claimId]
  );
}

/** Ranks the given pending claims 1..n in the order listed. */
export async function setCircuitWaiverClaimRanks(
  client: DbClient,
  memberId: number,
  claimIds: readonly number[]
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_waiver_claim c
     SET rank = o.rank, updated_at = now()
     FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, rank)
     WHERE c.id = o.id AND c.member_id = $1 AND c.status = 'PENDING'
       AND c.rank IS DISTINCT FROM o.rank::int`,
    [memberId, claimIds]
  );
}

/** A member's chips in pick order, each with the pending claim it rides on. */
export async function listCircuitChipsForMember(
  client: DbClient,
  memberId: number
): Promise<CircuitMemberChipRow[]> {
  const { rows } = await query<CircuitMemberChipRow>(
    client,
    `SELECT ch.id::int, ch.original_pick_number, ch.status, c.id::int AS claim_id
     FROM circuit_chip ch
     LEFT JOIN circuit_waiver_claim c ON c.chip_id = ch.id AND c.status = 'PENDING'
     WHERE ch.member_id = $1
     ORDER BY ch.original_pick_number`,
    [memberId]
  );
  return rows;
}

/** The league's chips with their holders, in pick order. */
export async function listCircuitLeagueChips(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitLeagueChipRow[]> {
  const { rows } = await query<CircuitLeagueChipRow>(
    client,
    `SELECT ch.id::int, m.user_id::int, u.username, ch.original_pick_number, ch.status
     FROM circuit_chip ch
     JOIN circuit_league_member m ON m.id = ch.member_id
     JOIN app_user u ON u.id = m.user_id
     WHERE ch.circuit_league_id = $1
     ORDER BY ch.original_pick_number`,
    [circuitLeagueId]
  );
  return rows;
}

/** The league's members in rolling priority order; unset priorities last. */
export async function listCircuitWaiverPriorities(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitWaiverPriorityRow[]> {
  const { rows } = await query<CircuitWaiverPriorityRow>(
    client,
    `SELECT m.id::int AS member_id, m.user_id::int, u.username, m.waiver_priority
     FROM circuit_league_member m
     JOIN app_user u ON u.id = m.user_id
     WHERE m.circuit_league_id = $1
     ORDER BY m.waiver_priority NULLS LAST, m.joined_at, m.id`,
    [circuitLeagueId]
  );
  return rows;
}

/**
 * Rewrites the league's rolling priority in one statement. The unique key on
 * (league, priority) is deferred, so any permutation is allowed.
 */
export async function setCircuitWaiverPriorities(
  client: DbClient,
  circuitLeagueId: number,
  priorities: readonly WaiverPriority[]
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_league_member m
     SET waiver_priority = p.waiver_priority
     FROM unnest($2::bigint[], $3::int[]) AS p(member_id, waiver_priority)
     WHERE m.circuit_league_id = $1 AND m.id = p.member_id`,
    [
      circuitLeagueId,
      priorities.map((p) => p.member_id),
      priorities.map((p) => p.waiver_priority)
    ]
  );
}

/*
 * The processor's reads and writes. It runs them inside one transaction per
 * (league, window), after locking the league row FOR UPDATE.
 */

export type CircuitWaiverRunClaimRow = {
  id: number;
  member_id: number;
  selection_id: number;
  drop_selection_id: number | null;
  chip_id: number | null;
  rank: number;
  /** The chip's original pick number while the chip is available; else null. */
  chip_pick_number: number | null;
};

export type CircuitWaiverLeagueRow = {
  circuit_league_id: number;
  draft_completed_at: Date;
};

/** Leagues the scheduler looks at: drafted, and in or past their season. */
export async function listCircuitWaiverLeagues(
  client: DbClient
): Promise<CircuitWaiverLeagueRow[]> {
  const { rows } = await query<CircuitWaiverLeagueRow>(
    client,
    `SELECT cl.id::int AS circuit_league_id, d.completed_at AS draft_completed_at
     FROM circuit_league cl
     JOIN circuit_draft d ON d.circuit_league_id = cl.id
     WHERE cl.status IN ('IN_SEASON', 'COMPLETE') AND d.status = 'COMPLETED'
     ORDER BY cl.id`
  );
  return rows;
}

/** When the league's draft completed; null before then. */
export async function getCircuitDraftCompletedAt(
  client: DbClient,
  circuitLeagueId: number
): Promise<Date | null> {
  const { rows } = await query<{ completed_at: Date | null }>(
    client,
    `SELECT completed_at FROM circuit_draft
     WHERE circuit_league_id = $1 AND status = 'COMPLETED'`,
    [circuitLeagueId]
  );
  return rows[0]?.completed_at ?? null;
}

/** First days of the league's windows that have a run. */
export async function listCircuitWaiverRunStarts(
  client: DbClient,
  circuitLeagueId: number
): Promise<string[]> {
  const { rows } = await query<{ window_starts_on: string }>(
    client,
    `SELECT window_starts_on::text FROM circuit_waiver_run WHERE circuit_league_id = $1`,
    [circuitLeagueId]
  );
  return rows.map((r) => r.window_starts_on);
}

/** First days of the windows the league's pending claims are keyed to. */
export async function listPendingCircuitWaiverClaimStarts(
  client: DbClient,
  circuitLeagueId: number
): Promise<string[]> {
  const { rows } = await query<{ window_starts_on: string }>(
    client,
    `SELECT DISTINCT window_starts_on::text FROM circuit_waiver_claim
     WHERE circuit_league_id = $1 AND status = 'PENDING'`,
    [circuitLeagueId]
  );
  return rows.map((r) => r.window_starts_on);
}

/**
 * Starts the run for a (league, window). Returns its id, or null when the
 * window already has a run: the unique key makes processing idempotent.
 */
export async function insertCircuitWaiverRun(
  client: DbClient,
  input: {
    circuit_league_id: number;
    window_starts_on: string;
    window_ends_on: string;
    priority_before: readonly WaiverPriority[];
  }
): Promise<number | null> {
  const { rows } = await query<{ id: number }>(
    client,
    `INSERT INTO circuit_waiver_run
       (circuit_league_id, window_starts_on, window_ends_on, priority_before)
     VALUES ($1, $2::date, $3::date, $4::jsonb)
     ON CONFLICT (circuit_league_id, window_starts_on) DO NOTHING
     RETURNING id::int`,
    [
      input.circuit_league_id,
      input.window_starts_on,
      input.window_ends_on,
      JSON.stringify(input.priority_before)
    ]
  );
  return rows[0]?.id ?? null;
}

/** Marks a run complete with the priority it wrote. */
export async function completeCircuitWaiverRun(
  client: DbClient,
  runId: number,
  priorityAfter: readonly WaiverPriority[]
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_waiver_run
     SET status = 'COMPLETED', completed_at = now(), priority_after = $2::jsonb
     WHERE id = $1`,
    [runId, JSON.stringify(priorityAfter)]
  );
}

/** A window's pending claims, with each available chip's value. */
export async function listPendingCircuitWaiverClaimsForRun(
  client: DbClient,
  circuitLeagueId: number,
  windowStartsOn: string
): Promise<CircuitWaiverRunClaimRow[]> {
  const { rows } = await query<CircuitWaiverRunClaimRow>(
    client,
    `SELECT c.id::int, c.member_id::int, c.selection_id::int,
            c.drop_selection_id::int, c.chip_id::int, c.rank,
            CASE WHEN ch.status = 'AVAILABLE' THEN ch.original_pick_number END
              AS chip_pick_number
     FROM circuit_waiver_claim c
     LEFT JOIN circuit_chip ch ON ch.id = c.chip_id
     WHERE c.circuit_league_id = $1 AND c.window_starts_on = $2::date
       AND c.status = 'PENDING'
     ORDER BY c.member_id, c.rank, c.id`,
    [circuitLeagueId, windowStartsOn]
  );
  return rows;
}

/** Records a claim's outcome in its run. */
export async function resolveCircuitWaiverClaim(
  client: DbClient,
  claimId: number,
  runId: number,
  failureReason: string | null
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_waiver_claim
     SET status = CASE WHEN $3::text IS NULL THEN 'WON' ELSE 'LOST' END,
         failure_reason = $3::text, run_id = $2, updated_at = now()
     WHERE id = $1 AND status = 'PENDING'`,
    [claimId, runId, failureReason]
  );
}

/** Consumes an available chip for the claim it won with. */
export async function consumeCircuitChip(
  client: DbClient,
  chipId: number,
  claimId: number
): Promise<void> {
  await query(
    client,
    `UPDATE circuit_chip SET status = 'CONSUMED', consumed_claim_id = $2
     WHERE id = $1 AND status = 'AVAILABLE'`,
    [chipId, claimId]
  );
}

/** Expires every available chip in the league; returns how many. */
export async function expireCircuitChips(
  client: DbClient,
  circuitLeagueId: number
): Promise<number> {
  const { rowCount } = await query(
    client,
    `UPDATE circuit_chip SET status = 'EXPIRED', expired_at = now()
     WHERE circuit_league_id = $1 AND status = 'AVAILABLE'`,
    [circuitLeagueId]
  );
  return rowCount ?? 0;
}

/*
 * Results, which the whole league sees once a run completes. Only resolved
 * claims of completed runs are read here; a pending claim never is.
 */

export type CircuitWaiverRunRow = {
  id: number;
  window_starts_on: string;
  window_ends_on: string;
  completed_at: Date;
  priority_before: WaiverPriority[];
  priority_after: WaiverPriority[];
};

export type CircuitWaiverResultClaimRow = {
  id: number;
  run_id: number;
  member_id: number;
  user_id: number;
  username: string;
  selection_id: number;
  drop_selection_id: number | null;
  chip_id: number | null;
  /** The chip's original pick number; set whenever the claim carried one. */
  chip_pick_number: number | null;
  rank: number;
  status: "WON" | "LOST";
  failure_reason: string | null;
};

/** The league's completed runs, newest window first. */
export async function listCompletedCircuitWaiverRuns(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitWaiverRunRow[]> {
  const { rows } = await query<CircuitWaiverRunRow>(
    client,
    `SELECT id::int, window_starts_on::text, window_ends_on::text, completed_at,
            priority_before, priority_after
     FROM circuit_waiver_run
     WHERE circuit_league_id = $1 AND status = 'COMPLETED'
     ORDER BY window_starts_on DESC`,
    [circuitLeagueId]
  );
  return rows;
}

/** The won and lost claims of the league's completed runs. */
export async function listResolvedCircuitWaiverClaims(
  client: DbClient,
  circuitLeagueId: number
): Promise<CircuitWaiverResultClaimRow[]> {
  const { rows } = await query<CircuitWaiverResultClaimRow>(
    client,
    `SELECT c.id::int, c.run_id::int, c.member_id::int, m.user_id::int, u.username,
            c.selection_id::int, c.drop_selection_id::int, c.chip_id::int,
            ch.original_pick_number AS chip_pick_number, c.rank, c.status,
            c.failure_reason
     FROM circuit_waiver_claim c
     JOIN circuit_waiver_run r ON r.id = c.run_id AND r.status = 'COMPLETED'
     JOIN circuit_league_member m ON m.id = c.member_id
     JOIN app_user u ON u.id = m.user_id
     LEFT JOIN circuit_chip ch ON ch.id = c.chip_id
     WHERE c.circuit_league_id = $1 AND c.status IN ('WON', 'LOST')
     ORDER BY c.run_id, c.id`,
    [circuitLeagueId]
  );
  return rows;
}
