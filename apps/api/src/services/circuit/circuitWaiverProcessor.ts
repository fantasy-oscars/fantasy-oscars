import type { Pool } from "pg";
import { runInTransaction } from "../../data/db.js";
import { getCircuitLeagueById } from "../../data/repositories/circuitLeagueRepository.js";
import {
  findOpenOwnershipOfSelection,
  getCategoryMaxOwned,
  getSelectionPlacement,
  listOpenOwnershipsForMember
} from "../../data/repositories/circuitOwnershipRepository.js";
import {
  completeCircuitWaiverRun,
  consumeCircuitChip,
  expireCircuitChips,
  getCircuitDraftCompletedAt,
  insertCircuitWaiverRun,
  listCircuitWaiverPriorities,
  listPendingCircuitWaiverClaimsForRun,
  lockCircuitWaiverClaimant,
  resolveCircuitWaiverClaim,
  setCircuitWaiverPriorities
} from "../../data/repositories/circuitWaiverRepository.js";
import {
  orderWaiverClaims,
  rotateWaiverPriorities,
  waiverClaimFailure,
  waiverRunExpiresChips,
  type DueWaiverWindow,
  type WaiverFailureReason,
  type WaiverPriority
} from "../../domain/circuitWaivers.js";
import { AppError } from "../../errors.js";
import { applyOwnershipChange } from "./circuitOwnership.js";
import { emitCircuitWaiverResult } from "./circuitWaiverEvents.js";

/*
 * The waiver processor (ADR 0005, section 9). One database transaction per
 * (league, window):
 *
 * 1. Lock the league row FOR UPDATE. Claim writes share-lock it, so every
 *    write either commits before the run or waits and then sees the run.
 * 2. Insert the run row. Its unique key makes the run idempotent: when the
 *    window already has one, nothing happens.
 * 3. Evaluate the window's pending claims in order (chipped by pick number,
 *    then rolling priority, then the member's rank), each against the state
 *    the previous one left. A win is one WAIVER transaction through
 *    applyOwnershipChange and consumes its chip; a loss changes nothing but
 *    the claim.
 * 4. Expire the league's available chips if this is its first window.
 * 5. Rewrite rolling priority once, and complete the run.
 *
 * Once the run commits, the league's room hears about it (`waiver:result`).
 */

export type CircuitWaiverRunResult = {
  circuit_league_id: number;
  run_id: number;
  window_starts_on: string;
  won: number;
  lost: number;
  chips_expired: number;
};

/**
 * Runs one (league, window). Returns null when the window already has a run,
 * so a repeat is a no-op.
 */
export async function processCircuitWaiverWindow(
  pool: Pool,
  circuitLeagueId: number,
  window: DueWaiverWindow
): Promise<CircuitWaiverRunResult | null> {
  const result = await runInTransaction(pool, async (tx) => {
    const league = await getCircuitLeagueById(tx, circuitLeagueId, { forUpdate: true });
    if (!league) throw new AppError("NOT_FOUND", 404, "Season not found");
    const draftCompletedAt = await getCircuitDraftCompletedAt(tx, league.id);
    if (!draftCompletedAt) {
      throw new AppError(
        "CIRCUIT_DRAFT_NOT_COMPLETE",
        409,
        "Waiver claims run after the draft"
      );
    }

    const before: WaiverPriority[] = (
      await listCircuitWaiverPriorities(tx, league.id)
    ).flatMap((p) =>
      p.waiver_priority === null
        ? []
        : [{ member_id: p.member_id, waiver_priority: p.waiver_priority }]
    );
    const runId = await insertCircuitWaiverRun(tx, {
      circuit_league_id: league.id,
      window_starts_on: window.starts_on,
      window_ends_on: window.ends_on,
      priority_before: before
    });
    if (runId === null) return null;

    const claims = orderWaiverClaims(
      await listPendingCircuitWaiverClaimsForRun(tx, league.id, window.starts_on),
      before
    );
    const winners = new Set<number>();
    let lost = 0;
    for (const claim of claims) {
      // The member lock first, as every acquisition takes it, so the roster
      // read below is the one applyOwnershipChange checks.
      await lockCircuitWaiverClaimant(tx, claim.member_id);
      const selection = (await getSelectionPlacement(tx, claim.selection_id))!;
      const owner = await findOpenOwnershipOfSelection(tx, league.id, selection.id);
      const held = await listOpenOwnershipsForMember(tx, league.id, claim.member_id);
      const maxOwned = await getCategoryMaxOwned(tx, league.id, selection.category_id);
      const failure: WaiverFailureReason | null = waiverClaimFailure({
        selectionOwner: owner?.member_id ?? null,
        held,
        add: { selection_id: selection.id, category_id: selection.category_id },
        dropSelectionId: claim.drop_selection_id,
        rosterSize: league.roster_size,
        maxOwned
      });
      if (failure) {
        await resolveCircuitWaiverClaim(tx, claim.id, runId, failure);
        lost += 1;
        continue;
      }
      await applyOwnershipChange(tx, league, {
        kind: "WAIVER",
        memberId: claim.member_id,
        addSelectionId: claim.selection_id,
        dropSelectionId: claim.drop_selection_id,
        claimId: claim.id,
        actorUserId: null
      });
      await resolveCircuitWaiverClaim(tx, claim.id, runId, null);
      if (claim.chip_id !== null && claim.chip_pick_number !== null) {
        await consumeCircuitChip(tx, claim.chip_id, claim.id);
      }
      winners.add(claim.member_id);
    }

    const chipsExpired = waiverRunExpiresChips(window.starts_on, draftCompletedAt)
      ? await expireCircuitChips(tx, league.id)
      : 0;
    const after = rotateWaiverPriorities(before, winners);
    await setCircuitWaiverPriorities(tx, league.id, after);
    await completeCircuitWaiverRun(tx, runId, after);
    return {
      circuit_league_id: league.id,
      run_id: runId,
      window_starts_on: window.starts_on,
      won: claims.length - lost,
      lost,
      chips_expired: chipsExpired
    };
  });
  if (result) emitCircuitWaiverResult(result);
  return result;
}
