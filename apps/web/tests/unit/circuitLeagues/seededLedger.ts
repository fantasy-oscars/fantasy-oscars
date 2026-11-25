import type {
  CircuitCeremonyBreakdown,
  CircuitRoster,
  CircuitScoringContender,
  CircuitSelectionSummary,
  CircuitStandingRow
} from "@/lib/types";
import { circuitRoster, circuitSelection } from "./fixtures";

/*
 * A seeded league with a drop between a nomination and a win, in one
 * ceremony: alice held Night Train when it was nominated, dropped it, and bob
 * held it when it won. The ledger:
 *
 *   Golden Reel 2027 (1): alice Night Train NOM 1 (dropped since)
 *                         alice Static NOM 1
 *                         bob   Night Train WIN 2
 *                         bob   Ada Lane, Paper Moon NOM 1, WIN 2
 *   Directors Guild (2):  bob   Ada Lane, Paper Moon NOM 1.5
 *                         cy    Moonrise NOM 1
 *
 * Season totals: bob 6.5, alice 2, cy 1.
 */
export const NIGHT_TRAIN = circuitSelection(1, "Night Train");
export const PAPER_MOON = circuitSelection(2, "Paper Moon", "Ada Lane");
export const STATIC = circuitSelection(3, "Static");
export const MOONRISE = circuitSelection(4, "Moonrise");

type Kind = "NOMINATION" | "WIN";
export type LedgerRow = {
  ceremonyId: number;
  userId: number;
  selection: CircuitSelectionSummary;
  kind: Kind;
  points: number;
};

export const LEDGER: LedgerRow[] = [
  { ceremonyId: 1, userId: 5, selection: NIGHT_TRAIN, kind: "NOMINATION", points: 1 },
  { ceremonyId: 1, userId: 5, selection: STATIC, kind: "NOMINATION", points: 1 },
  { ceremonyId: 1, userId: 6, selection: NIGHT_TRAIN, kind: "WIN", points: 2 },
  { ceremonyId: 1, userId: 6, selection: PAPER_MOON, kind: "NOMINATION", points: 1 },
  { ceremonyId: 1, userId: 6, selection: PAPER_MOON, kind: "WIN", points: 2 },
  { ceremonyId: 2, userId: 6, selection: PAPER_MOON, kind: "NOMINATION", points: 1.5 },
  { ceremonyId: 2, userId: 7, selection: MOONRISE, kind: "NOMINATION", points: 1 }
];
export const CEREMONY_NAMES: Record<number, string> = {
  1: "Golden Reel 2027",
  2: "Directors Guild"
};
export const MEMBERS = [
  { user_id: 5, username: "alice", avatar_key: "owl" },
  { user_id: 6, username: "bob", avatar_key: "fox" },
  { user_id: 7, username: "cy", avatar_key: "bear" }
];
/** What each member holds now: alice dropped Night Train, bob picked it up. */
export const HELD: Record<number, CircuitSelectionSummary[]> = {
  5: [STATIC],
  6: [NIGHT_TRAIN, PAPER_MOON],
  7: [MOONRISE]
};
/** When alice dropped Night Train (noon UTC, so every zone shows the same day). */
export const DROPPED_AT = "2027-02-14T12:00:00.000Z";
export const holds = (userId: number, selectionId: number) =>
  HELD[userId]!.some((s) => s.id === selectionId);

export const sum = (values: number[]) =>
  values.reduce((a, b) => a + Math.round(b * 100), 0) / 100;

export function standingRows(rows: LedgerRow[]): CircuitStandingRow[] {
  const totals = MEMBERS.map((m) => {
    const own = rows.filter((r) => r.userId === m.user_id);
    return {
      member: { user_id: m.user_id, username: m.username, avatar_key: m.avatar_key },
      points: sum(own.map((r) => r.points)),
      nomination_points: sum(
        own.filter((r) => r.kind === "NOMINATION").map((r) => r.points)
      ),
      win_points: sum(own.filter((r) => r.kind === "WIN").map((r) => r.points))
    };
  }).sort((a, b) => b.points - a.points);
  return totals.map((t) => ({
    ...t,
    rank: totals.findIndex((o) => o.points === t.points) + 1
  }));
}

export function breakdownFor(ceremonyId: number): CircuitCeremonyBreakdown {
  const rows = LEDGER.filter((r) => r.ceremonyId === ceremonyId);
  return {
    ceremony: {
      id: ceremonyId,
      code: null,
      name: CEREMONY_NAMES[ceremonyId]!,
      event: { id: 10, name: "Event" },
      nominations_on: null,
      results_on: null
    },
    standings: standingRows(rows).map((s) => ({
      ...s,
      entries: rows
        .filter((r) => r.userId === s.member.user_id)
        .map((r) => ({
          selection: r.selection,
          kind: r.kind,
          occasion_date: "2027-01-10",
          points: r.points,
          owned_now: holds(r.userId, r.selection.id),
          dropped_at: holds(r.userId, r.selection.id) ? null : DROPPED_AT
        }))
    }))
  };
}

export function ceremonyLines(rows: LedgerRow[]) {
  return [1, 2].flatMap((ceremonyId) => {
    const own = rows.filter((r) => r.ceremonyId === ceremonyId);
    if (own.length === 0) return [];
    return [
      {
        ceremony_id: ceremonyId,
        ceremony_name: CEREMONY_NAMES[ceremonyId]!,
        nomination: sum(own.filter((r) => r.kind === "NOMINATION").map((r) => r.points)),
        win: sum(own.filter((r) => r.kind === "WIN").map((r) => r.points))
      }
    ];
  });
}

export function rosterFor(userId: number): CircuitRoster {
  const member = MEMBERS.find((m) => m.user_id === userId)!;
  const base = circuitRoster({ entries: HELD[userId]!, rosterSize: 4 });
  const own = LEDGER.filter((r) => r.userId === userId);
  const entries = base.entries.map((e) => {
    const rows = own.filter((r) => r.selection.id === e.selection.id);
    return {
      ...e,
      points: { total: sum(rows.map((r) => r.points)), by_ceremony: ceremonyLines(rows) }
    };
  });
  const total = sum(own.map((r) => r.points));
  return {
    ...base,
    member: { user_id: userId, username: member.username },
    entries,
    points_total: total,
    dropped_points: sum(
      own.filter((r) => !holds(userId, r.selection.id)).map((r) => r.points)
    )
  };
}

export function contenders(): CircuitScoringContender[] {
  const ids = [...new Set(LEDGER.map((r) => r.selection.id))];
  return ids.map((id) => {
    const rows = LEDGER.filter((r) => r.selection.id === id);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    return {
      selection: rows[0]!.selection,
      total: sum(rows.map((r) => r.points)),
      members: userIds.map((userId) => ({
        ...MEMBERS.find((m) => m.user_id === userId)!,
        points: sum(rows.filter((r) => r.userId === userId).map((r) => r.points))
      })),
      lines: userIds.flatMap((userId) =>
        ceremonyLines(rows.filter((r) => r.userId === userId)).map((l) => ({
          ...l,
          user_id: userId
        }))
      )
    };
  });
}

export const SEASON = standingRows(LEDGER);
