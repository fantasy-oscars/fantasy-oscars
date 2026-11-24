/*
 * Points views of the Circuit scoring ledger. Pure: no IO.
 *
 * Every figure here is a sum of ledger rows (circuit_score_entry), taken in
 * hundredths like the standings, so a view's figures always add up to the
 * standings totals: per selection for one member (the roster), per selection
 * across members (the season's scoring contenders), and per member and
 * selection with whether the member still holds it (dropped picks).
 */

import { listScoringOccasions, type CircuitCeremonyDates } from "./circuit.js";
import type { ScoreEntry } from "./circuitScoring.js";

export type PointsEntry = Pick<
  ScoreEntry,
  "member_id" | "selection_id" | "ceremony_id" | "kind" | "points"
>;

/** One ceremony's part of a figure: its nomination and win points. */
export type CeremonyPoints = { ceremony_id: number; nomination: number; win: number };

export type SelectionPoints = { total: number; by_ceremony: CeremonyPoints[] };

/**
 * Orders ceremonies: lower first. Ceremonies the order does not know go last,
 * by id.
 */
export type CeremonyOrder = ReadonlyMap<number, number>;

/** Ceremonies in scoring order, as the standings list them: by first occasion. */
export function ceremonyOrderOf(ceremonies: CircuitCeremonyDates[]): CeremonyOrder {
  const order = new Map<number, number>();
  for (const o of listScoringOccasions(ceremonies)) {
    if (!order.has(o.ceremony_id)) order.set(o.ceremony_id, order.size);
  }
  return order;
}

const cents = (points: number) => Math.round(points * 100);

const ZERO_POINTS = (): SelectionPoints => ({ total: 0, by_ceremony: [] });

function byCeremony(order: CeremonyOrder) {
  const rank = (id: number) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  return (a: { ceremony_id: number }, b: { ceremony_id: number }) =>
    rank(a.ceremony_id) - rank(b.ceremony_id) || a.ceremony_id - b.ceremony_id;
}

type Tally = {
  total: number;
  ceremonies: Map<number, { NOMINATION: number; WIN: number }>;
};

function tally(entries: readonly PointsEntry[], keyOf: (e: PointsEntry) => string) {
  const tallies = new Map<string, Tally>();
  for (const e of entries) {
    const key = keyOf(e);
    let t = tallies.get(key);
    if (!t) {
      t = { total: 0, ceremonies: new Map() };
      tallies.set(key, t);
    }
    let c = t.ceremonies.get(e.ceremony_id);
    if (!c) {
      c = { NOMINATION: 0, WIN: 0 };
      t.ceremonies.set(e.ceremony_id, c);
    }
    c[e.kind] += cents(e.points);
    t.total += cents(e.points);
  }
  return tallies;
}

function linesOf(t: Tally, order: CeremonyOrder): CeremonyPoints[] {
  return [...t.ceremonies.entries()]
    .map(([ceremony_id, c]) => ({
      ceremony_id,
      nomination: c.NOMINATION / 100,
      win: c.WIN / 100
    }))
    .sort(byCeremony(order));
}

export type MemberRosterPoints = {
  /** Points per selection the member holds; a held selection without points is on 0. */
  by_selection: Map<number, SelectionPoints>;
  /** Every ledger point of the member: the standings total. */
  points_total: number;
  /** Points from selections the member no longer holds. */
  dropped_points: number;
};

/**
 * One member's points per held selection, while they owned it, plus the
 * points from selections they have since dropped. The held selections'
 * totals plus `dropped_points` equal `points_total`.
 */
export function memberRosterPoints(
  entries: readonly PointsEntry[],
  memberId: number,
  heldSelectionIds: readonly number[],
  order: CeremonyOrder
): MemberRosterPoints {
  const own = entries.filter((e) => e.member_id === memberId);
  const tallies = tally(own, (e) => String(e.selection_id));
  const held = new Set(heldSelectionIds);
  let total = 0;
  let dropped = 0;
  for (const [key, t] of tallies) {
    total += t.total;
    if (!held.has(Number(key))) dropped += t.total;
  }
  const by_selection = new Map<number, SelectionPoints>(
    heldSelectionIds.map((id) => {
      const t = tallies.get(String(id));
      return [
        id,
        t ? { total: t.total / 100, by_ceremony: linesOf(t, order) } : ZERO_POINTS()
      ];
    })
  );
  return { by_selection, points_total: total / 100, dropped_points: dropped / 100 };
}

export type ScoringContender = {
  selection_id: number;
  total: number;
  /** Each member it scored for, highest first. */
  members: Array<{ member_id: number; points: number }>;
  /** One line per ceremony and member it scored for, in ceremony order. */
  lines: Array<CeremonyPoints & { member_id: number }>;
};

/**
 * Every selection that scored in the league, with its points per member and
 * per ceremony and member. Highest total first, then by selection id. The
 * totals add up to the sum of the standings.
 */
export function scoringContenders(
  entries: readonly PointsEntry[],
  order: CeremonyOrder
): ScoringContender[] {
  const bySelection = tally(entries, (e) => String(e.selection_id));
  const byMember = tally(entries, (e) => `${e.selection_id}:${e.member_id}`);
  const contenders = [...bySelection.entries()].map(([key, t]) => {
    const selection_id = Number(key);
    const members: ScoringContender["members"] = [];
    const lines: ScoringContender["lines"] = [];
    for (const [memberKey, m] of byMember) {
      const [selection, member] = memberKey.split(":").map(Number) as [number, number];
      if (selection !== selection_id) continue;
      members.push({ member_id: member, points: m.total / 100 });
      for (const line of linesOf(m, order)) lines.push({ ...line, member_id: member });
    }
    members.sort((a, b) => b.points - a.points || a.member_id - b.member_id);
    lines.sort((a, b) => byCeremony(order)(a, b) || a.member_id - b.member_id);
    return { selection_id, total: t.total / 100, members, lines };
  });
  return contenders.sort((a, b) => b.total - a.total || a.selection_id - b.selection_id);
}
