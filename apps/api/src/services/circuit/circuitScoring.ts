import type { Pool } from "pg";
import { runInTransaction } from "../../data/db.js";
import {
  getCircuitLeagueById,
  listCircuitLeagueCategories,
  listCircuitLeagueEvents,
  moveCircuitLeagueStatus
} from "../../data/repositories/circuitLeagueRepository.js";
import { listCircuitOwnershipHistory } from "../../data/repositories/circuitOwnershipRepository.js";
import {
  deleteDetachedScoreEntries,
  deleteScoreEntries,
  getLeagueBasePoints,
  getScoringCeremony,
  getScoringLeague,
  insertScoreEntries,
  listLeagueCompletionCeremonies,
  listScoringCeremonyIds,
  listScoringLeaguesForCeremony,
  listScoringLeaguesForCircuit,
  listScoringOccasionsOnDay,
  listScoringSelections,
  loadCeremonyMatchInputs,
  lockScoreOccasion,
  type ScoringLeagueRow
} from "../../data/repositories/circuitScoreRepository.js";
import { resultsDateOf, type ScoringOccasionKind } from "../../domain/circuit.js";
import { matchOccasion } from "../../domain/circuitMatching.js";
import { circuitLeagueStatusAfterScoring } from "../../domain/circuitLeague.js";
import { scoreOccasion } from "../../domain/circuitScoring.js";
import { log } from "../../logger.js";
import { type Actor, audit, requireCircuit } from "./circuitGuards.js";
import { emitCircuitScoreUpdates } from "./circuitScoreEvents.js";

/*
 * The scoring ledger rebuild (ADR 0005, section 8). Each (league, ceremony,
 * kind) is rebuilt in its own transaction: lock, read the inputs, delete the
 * occasion's rows, insert scoreOccasion's output. A rebuild reads only stored
 * history, so running it twice gives the same rows.
 *
 * Callers rebuild after their own write has committed: nomination, winner and
 * date writes, mapping and event-structure writes, a league's enabled events
 * and scoring settings, the admin rebuild action, and the waiver scheduler
 * when an occasion's day begins (for scoring data entered ahead of its day).
 * Every rebuild then tells the leagues whose rows changed (`score:update`),
 * including for the occasions it committed before a failure, and settles the
 * status of every league it covered (IN_SEASON or COMPLETE, below).
 */

export const SCORING_OCCASION_KINDS: readonly ScoringOccasionKind[] = [
  "NOMINATION",
  "WIN"
];

export type OccasionRebuild = {
  circuit_league_id: number;
  ceremony_id: number;
  kind: ScoringOccasionKind;
  removed: number;
  inserted: number;
};

export type ScoreRebuildScope = {
  circuitLeagueId?: number;
  circuitId?: number;
  ceremonyId?: number;
  kinds?: readonly ScoringOccasionKind[];
};

/** A rebuild that removed and inserted nothing left the ledger as it was. */
const changed = (r: OccasionRebuild) => r.removed > 0 || r.inserted > 0;

/**
 * Settles a season in play as IN_SEASON or COMPLETE from stored history
 * (`circuitLeagueStatusAfterScoring`): the league row is locked, so two
 * callers cannot disagree, and running it again changes nothing. Returns the
 * status the league now has, or null when the league no longer exists.
 */
export async function syncCircuitLeagueCompletion(
  pool: Pool,
  circuitLeagueId: number,
  now: Date = new Date()
): Promise<string | null> {
  return runInTransaction(pool, async (tx) => {
    const league = await getCircuitLeagueById(tx, circuitLeagueId, { forUpdate: true });
    if (!league) return null;
    if (league.status !== "IN_SEASON" && league.status !== "COMPLETE") {
      return league.status;
    }
    const events = await listCircuitLeagueEvents(tx, league.id);
    const ceremonies = await listLeagueCompletionCeremonies(tx, league.id);
    const next = circuitLeagueStatusAfterScoring(
      league.status,
      events.map((e) => e.circuit_event_id),
      ceremonies,
      now
    );
    if (next === league.status) return league.status;
    await moveCircuitLeagueStatus(
      tx,
      league.id,
      league.status,
      next as "IN_SEASON" | "COMPLETE"
    );
    return next;
  });
}

/** Settles each league once; a failure is logged, the ledger is already written. */
async function syncCompletionOf(
  pool: Pool,
  leagueIds: Iterable<number>,
  now: Date
): Promise<void> {
  for (const id of new Set(leagueIds)) {
    try {
      await syncCircuitLeagueCompletion(pool, id, now);
    } catch (err) {
      log({
        level: "error",
        msg: "circuit_league_completion_failed",
        circuit_league_id: id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

/** Settles the leagues of every Circuit the ceremony belongs to; never throws. */
export async function syncCircuitCompletionForCeremony(
  pool: Pool,
  ceremonyId: number,
  now: Date = new Date()
): Promise<void> {
  try {
    const leagues = await listScoringLeaguesForCeremony(pool, ceremonyId);
    await syncCompletionOf(
      pool,
      leagues.map((l) => l.id),
      now
    );
  } catch (err) {
    log({
      level: "error",
      msg: "circuit_league_completion_failed",
      ceremony_id: ceremonyId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Rebuilds one occasion of one league in one transaction. */
export async function rebuildCircuitLeagueOccasion(
  pool: Pool,
  league: ScoringLeagueRow,
  ceremonyId: number,
  kind: ScoringOccasionKind,
  now: Date = new Date()
): Promise<OccasionRebuild> {
  return runInTransaction(pool, async (tx) => {
    await lockScoreOccasion(tx, league.id, ceremonyId);
    const removed = await deleteScoreEntries(tx, league.id, ceremonyId, kind);
    const ceremony = await getScoringCeremony(tx, league.circuit_id, ceremonyId);
    const base = await getLeagueBasePoints(tx, league.id);
    const date =
      ceremony === null
        ? null
        : kind === "NOMINATION"
          ? ceremony.nominations_on
          : resultsDateOf(ceremony.starts_at);
    if (ceremony === null || base === null || date === null) {
      return {
        circuit_league_id: league.id,
        ceremony_id: ceremonyId,
        kind,
        removed,
        inserted: 0
      };
    }

    // One client runs one query at a time, so the reads are sequential.
    const inputs = await loadCeremonyMatchInputs(tx, league.circuit_id, ceremonyId);
    const selections = await listScoringSelections(tx, league.circuit_id);
    const intervals = await listCircuitOwnershipHistory(tx, league.id);
    const events = await listCircuitLeagueEvents(tx, league.id);
    const categories = await listCircuitLeagueCategories(tx, league.id);
    const categoryOf = new Map(selections.map((s) => [s.id, s.circuit_category_id]));
    const matches = matchOccasion({ kind, ...inputs, selections }).map((m) => ({
      ...m,
      circuit_category_id: categoryOf.get(m.selection_id)!
    }));
    const entries = scoreOccasion(
      intervals,
      {
        ceremony_id: ceremonyId,
        kind,
        circuit_event_id: ceremony.circuit_event_id,
        date
      },
      matches,
      {
        ...base,
        event_weights: new Map(events.map((e) => [e.circuit_event_id, e.weight])),
        category_weights: new Map(
          categories.map((c) => [c.circuit_category_id, c.weight])
        )
      },
      now
    );
    await insertScoreEntries(tx, league.id, entries);
    return {
      circuit_league_id: league.id,
      ceremony_id: ceremonyId,
      kind,
      removed,
      inserted: entries.length
    };
  });
}

async function leaguesInScope(pool: Pool, scope: ScoreRebuildScope) {
  if (scope.circuitLeagueId !== undefined) {
    const league = await getScoringLeague(pool, scope.circuitLeagueId);
    return league ? [league] : [];
  }
  if (scope.circuitId !== undefined) {
    return listScoringLeaguesForCircuit(pool, scope.circuitId);
  }
  if (scope.ceremonyId !== undefined) {
    return listScoringLeaguesForCeremony(pool, scope.ceremonyId);
  }
  return [];
}

/**
 * Rebuilds every occasion in scope. With a ceremony, only its occasions are
 * rebuilt, even when it has just left the Circuit (its rows are then
 * removed). Without one, every live ceremony of each league's Circuit is
 * rebuilt and rows of ceremonies that left are removed.
 */
export async function rebuildCircuitScores(
  pool: Pool,
  scope: ScoreRebuildScope,
  now: Date = new Date()
): Promise<OccasionRebuild[]> {
  const kinds = scope.kinds ?? SCORING_OCCASION_KINDS;
  const results: OccasionRebuild[] = [];
  // Ceremonies that left the Circuit: their rows go, with nothing to rebuild.
  const detached: { circuit_league_id: number; ceremony_id: number }[] = [];
  const covered: number[] = [];
  try {
    for (const league of await leaguesInScope(pool, scope)) {
      covered.push(league.id);
      let ceremonyIds: number[];
      if (scope.ceremonyId !== undefined) {
        ceremonyIds = [scope.ceremonyId];
      } else {
        const gone = await runInTransaction(pool, (tx) =>
          deleteDetachedScoreEntries(tx, league)
        );
        for (const ceremonyId of gone) {
          detached.push({ circuit_league_id: league.id, ceremony_id: ceremonyId });
        }
        ceremonyIds = await listScoringCeremonyIds(pool, league.circuit_id);
      }
      for (const ceremonyId of ceremonyIds) {
        for (const kind of kinds) {
          results.push(
            await rebuildCircuitLeagueOccasion(pool, league, ceremonyId, kind, now)
          );
        }
      }
    }
  } finally {
    emitCircuitScoreUpdates([...detached, ...results.filter(changed)]);
    await syncCompletionOf(pool, covered, now);
  }
  return results;
}

/**
 * For write paths: the write has already committed, so a failed rebuild is
 * logged rather than failing the request. The admin rebuild action repairs
 * the ledger.
 */
export async function rebuildCircuitScoresAfterWrite(
  pool: Pool,
  scope: ScoreRebuildScope,
  reason: string
): Promise<OccasionRebuild[]> {
  try {
    return await rebuildCircuitScores(pool, scope);
  } catch (err) {
    log({
      level: "error",
      msg: "circuit_score_rebuild_failed",
      reason,
      ...scope,
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

/** Rebuilds the occasions dated `day`, as their instant passes. */
export async function rebuildCircuitScoresForDay(
  pool: Pool,
  day: string,
  now: Date = new Date()
): Promise<OccasionRebuild[]> {
  const results: OccasionRebuild[] = [];
  const leagues = new Map<number, ScoringLeagueRow>();
  try {
    for (const occasion of await listScoringOccasionsOnDay(pool, day)) {
      let league = leagues.get(occasion.circuit_league_id) ?? null;
      if (!league) {
        league = await getScoringLeague(pool, occasion.circuit_league_id);
        if (!league) continue;
        leagues.set(league.id, league);
      }
      results.push(
        await rebuildCircuitLeagueOccasion(
          pool,
          league,
          occasion.ceremony_id,
          occasion.kind,
          now
        )
      );
    }
  } finally {
    emitCircuitScoreUpdates(results.filter(changed));
    await syncCompletionOf(
      pool,
      results.map((r) => r.circuit_league_id),
      now
    );
  }
  return results;
}

/** The admin action: rebuilds every league of the Circuit, audit-logged. */
export async function rebuildCircuitScoresAsAdmin(
  pool: Pool,
  actor: Actor,
  circuitId: number
) {
  await requireCircuit(pool, circuitId);
  const results = await rebuildCircuitScores(pool, { circuitId });
  const summary = {
    leagues: new Set(results.map((r) => r.circuit_league_id)).size,
    occasions: results.length,
    entries: results.reduce((sum, r) => sum + r.inserted, 0)
  };
  await audit(pool, actor, {
    action: "rebuild_circuit_scores",
    target_id: circuitId,
    meta: summary
  });
  return { rebuild: summary };
}
