/*
 * Circuit scoring (ADR 0005, section 8; ADR 0006, section 5). Pure: no IO.
 *
 * Points for one scoring occasion are a function of ownership at the
 * occasion's instant (00:00 America/Los_Angeles on its date), the selections
 * the occasion matches and the league's scoring matrix. The ledger table
 * stores the output; rebuilding it from the same inputs gives the same rows.
 */

import { instantOfDay, type ScoringOccasionKind } from "./circuit.js";
import type { SelectionMatch } from "./circuitMatching.js";
import { isHeldAt, type OwnershipInterval } from "./circuitOwnership.js";

export type ScoringInterval = OwnershipInterval & { id: number };

export type ScoringOccasionInput = {
  ceremony_id: number;
  kind: ScoringOccasionKind;
  /** The event the ceremony belongs to in this Circuit. */
  circuit_event_id: number;
  /** Whole day, `YYYY-MM-DD`; an undated occasion never scores. */
  date: string | null;
};

/** A match from matchOccasion, with the selection's Circuit category. */
export type ScoringMatch = SelectionMatch & { circuit_category_id: number };

export type ScoringMatrix = {
  nomination_points: number;
  win_bonus_points: number;
  /** Weights of the league's enabled events; a missing event is disabled. */
  event_weights: ReadonlyMap<number, number>;
  /** Category weights; a category without one weighs 1. */
  category_weights: ReadonlyMap<number, number>;
};

export type ScoreEntry = {
  member_id: number;
  selection_id: number;
  ceremony_id: number;
  kind: ScoringOccasionKind;
  occasion_date: string;
  points: number;
  ownership_id: number;
};

/** Points to two decimals, the ledger's precision. */
export function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The ledger entries for one occasion: one per matched selection that a
 * member held at the occasion's instant, worth base × category weight × event
 * weight (owner question 11). Nothing scores when the occasion has no date,
 * its instant is still ahead of `now` (ownership could yet change), or the
 * league has disabled its event. Ordered by selection id.
 */
export function scoreOccasion(
  intervals: readonly ScoringInterval[],
  occasion: ScoringOccasionInput,
  matches: readonly ScoringMatch[],
  matrix: ScoringMatrix,
  now: Date
): ScoreEntry[] {
  if (occasion.date === null) return [];
  const eventWeight = matrix.event_weights.get(occasion.circuit_event_id);
  if (eventWeight === undefined) return [];
  const instant = instantOfDay(occasion.date);
  if (instant.getTime() > now.getTime()) return [];

  const base =
    occasion.kind === "NOMINATION" ? matrix.nomination_points : matrix.win_bonus_points;
  const entries: ScoreEntry[] = [];
  const seen = new Set<number>();
  for (const match of [...matches].sort((a, b) => a.selection_id - b.selection_id)) {
    if (seen.has(match.selection_id)) continue;
    seen.add(match.selection_id);
    const held = intervals.find(
      (i) => i.selection_id === match.selection_id && isHeldAt(i, instant)
    );
    if (!held) continue;
    const categoryWeight = matrix.category_weights.get(match.circuit_category_id) ?? 1;
    entries.push({
      member_id: held.member_id,
      selection_id: match.selection_id,
      ceremony_id: occasion.ceremony_id,
      kind: occasion.kind,
      occasion_date: occasion.date,
      points: roundPoints(base * categoryWeight * eventWeight),
      ownership_id: held.id
    });
  }
  return entries;
}

export type StandingRow<M> = {
  member: M;
  /** Shared by tied members; the next rank skips (1, 1, 3). */
  rank: number;
  points: number;
  nomination_points: number;
  win_points: number;
};

/**
 * Sums ledger entries per member. Every member appears, members without
 * entries on 0, highest total first; ties share a rank and sort by username.
 * Sums are taken in hundredths so they equal the ledger's sum exactly.
 */
export function rankStandings<M extends { id: number; username: string }>(
  members: readonly M[],
  entries: readonly Pick<ScoreEntry, "member_id" | "kind" | "points">[]
): StandingRow<M>[] {
  const cents = new Map<number, { NOMINATION: number; WIN: number }>(
    members.map((m) => [m.id, { NOMINATION: 0, WIN: 0 }])
  );
  for (const entry of entries) {
    const sums = cents.get(entry.member_id);
    if (sums) sums[entry.kind] += Math.round(entry.points * 100);
  }
  const rows = members.map((member) => {
    const sums = cents.get(member.id)!;
    return {
      member,
      rank: 0,
      points: (sums.NOMINATION + sums.WIN) / 100,
      nomination_points: sums.NOMINATION / 100,
      win_points: sums.WIN / 100
    };
  });
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      a.member.username.localeCompare(b.member.username) ||
      a.member.id - b.member.id
  );
  rows.forEach((row, idx) => {
    const prev = rows[idx - 1];
    row.rank = prev && prev.points === row.points ? prev.rank : idx + 1;
  });
  return rows;
}
