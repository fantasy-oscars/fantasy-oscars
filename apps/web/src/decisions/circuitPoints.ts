import type {
  CircuitCeremonyBreakdown,
  CircuitLeagueCategory,
  CircuitRoster,
  CircuitScoringContender,
  CircuitSelectionSummary,
  CircuitStandingRow
} from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";
import { circuitPointsLabel } from "./circuitStandings";
import { contenderPillView, type ContenderPillView } from "./contenderPill";

/*
 * Points on season pills (pure): the signed figure at the end of a pill, the
 * breakdown section of its nominee card, and the views that group the
 * ledger's points by player, by category and by contender. The server sums
 * the ledger; these functions only regroup what it returns, adding in
 * hundredths so every list adds up to the total above it.
 */

const cents = (points: number) => Math.round(points * 100);

/** "3", "4.5", "0.25": at most two decimals, no trailing zeros. */
function plainPoints(points: number): string {
  const value = cents(points) / 100;
  return String(value === 0 ? 0 : value);
}

/** "+3", "0", "+4.5", "−1": the ceremony roster's signed figure, to two decimals. */
export function circuitSignedPoints(points: number): string {
  const value = cents(points) / 100;
  if (value > 0) return `+${plainPoints(value)}`;
  if (value < 0) return `−${plainPoints(-value)}`;
  return "0";
}

/** "Nomination +1 · Win +2", leaving out a part that scored nothing. */
export function circuitPointsDetail(input: { nomination: number; win: number }): string {
  const parts = [
    cents(input.nomination) !== 0
      ? `Nomination ${circuitSignedPoints(input.nomination)}`
      : null,
    cents(input.win) !== 0 ? `Win ${circuitSignedPoints(input.win)}` : null
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "No points";
}

/** The points section of a nominee card. */
export type CircuitPointsSection = {
  heading: string;
  lines: Array<{ key: string; label: string; detail: string; total: string }>;
  /** The "Total" line's figure; shown with two or more lines. */
  total: string | null;
  /** "No points yet." when there are no lines. */
  emptyText: string | null;
};

export type CircuitPointsLine = {
  ceremony_id: number;
  ceremony_name: string | null;
  nomination: number;
  win: number;
  /** Named in the contender-level view, where lines belong to several players. */
  playerName?: string | null;
  playerId?: number | null;
};

/**
 * The card's breakdown: "Points for pia" (or "Points" across players), one
 * line per ceremony, and a total that equals the pill's figure.
 */
export function circuitPointsSection(input: {
  playerName: string | null;
  lines: readonly CircuitPointsLine[];
}): CircuitPointsSection {
  const lines = input.lines.map((l) => ({
    key: `${l.ceremony_id}-${l.playerId ?? ""}`,
    label: [l.ceremony_name ?? "Ceremony", l.playerName ?? null]
      .filter((p): p is string => Boolean(p))
      .join(" · "),
    detail: circuitPointsDetail(l),
    total: circuitSignedPoints(l.nomination + l.win)
  }));
  const total = input.lines.reduce((sum, l) => sum + cents(l.nomination + l.win), 0);
  return {
    heading: input.playerName ? `Points for ${input.playerName}` : "Points",
    lines,
    total: lines.length >= 2 ? circuitSignedPoints(total / 100) : null,
    emptyText: lines.length === 0 ? "No points yet." : null
  };
}

/** A pill with its figure, gold state and breakdown. */
export type CircuitPointsPill = {
  key: string;
  selection: CircuitSelectionSummary;
  label: string;
  points: number;
  pointsLabel: string;
  winner: boolean;
  dropped: boolean;
  pointsSection: CircuitPointsSection;
};

function byPointsThenLabel(a: CircuitPointsPill, b: CircuitPointsPill) {
  return cents(b.points) - cents(a.points) || a.label.localeCompare(b.label);
}

/** A roster entry's pill: its season points for this player, gold if it won for them. */
export function circuitRosterEntryPill(
  entry: CircuitRoster["entries"][number],
  playerName: string
): CircuitPointsPill {
  return {
    key: String(entry.ownership_id),
    selection: entry.selection,
    label: circuitSelectionLabel(entry.selection),
    points: entry.points.total,
    pointsLabel: circuitSignedPoints(entry.points.total),
    winner: entry.points.by_ceremony.some((c) => cents(c.win) > 0),
    dropped: false,
    pointsSection: circuitPointsSection({ playerName, lines: entry.points.by_ceremony })
  };
}

/** A roster pick as the roster page draws it: the entry, its points pill and its card. */
export type CircuitRosterPick = {
  entry: CircuitRoster["entries"][number];
  pill: CircuitPointsPill;
  view: ContenderPillView;
};

/** Every pick of a roster, by ownership id, with its points pill and nominee card. */
export function circuitRosterPicks(
  roster: Pick<CircuitRoster, "entries" | "member">,
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "kind" | "icon_code" | "icon_variant"
  >[]
): Map<number, CircuitRosterPick> {
  return new Map(
    roster.entries.map((entry) => [
      entry.ownership_id,
      {
        entry,
        pill: circuitRosterEntryPill(entry, roster.member.username),
        view: contenderPillView(entry.selection, categories)
      }
    ])
  );
}

/** "4 of 4 · 12 pts so far": the roster page's picks meta. */
export function circuitRosterPointsMeta(
  roster: Pick<CircuitRoster, "entries" | "roster_size" | "points_total">
): string {
  return `${roster.entries.length} of ${roster.roster_size} · ${circuitPointsLabel(roster.points_total)} so far`;
}

/**
 * The remainder under a roster's pills, so they add up to its total: "Plus 2
 * pts from picks dropped earlier in the season." Null at zero.
 */
export function circuitDroppedPointsNote(
  droppedPoints: number,
  when: "earlier" | "during"
): string | null {
  if (cents(droppedPoints) === 0) return null;
  const phrase = when === "earlier" ? "earlier in the season" : "during the season";
  return `Plus ${circuitPointsLabel(droppedPoints)} from picks dropped ${phrase}.`;
}

/** A member's card in the per-player views. */
export type CircuitPlayerPointsCard = {
  userId: number;
  username: string;
  avatarKey: string | null;
  rank: number | null;
  /** "1. pia", or the bare name without a rank. */
  title: string;
  total: number;
  totalLabel: string;
  /** "Nominations 6 pts · Wins 2 pts" (ceremony points only). */
  summary: string | null;
  pills: CircuitPointsPill[];
  /** The dropped-picks remainder (Final rosters only). */
  remainder: string | null;
};

function rankedTitle(rank: number | null, username: string) {
  return rank === null ? username : `${rank}. ${username}`;
}

/**
 * Ceremony points by player: every member in rank order, one pill per
 * contender that scored for them at this ceremony (nomination plus win),
 * dropped since or not. The pills add up to the card's total.
 */
export function circuitCeremonyPointsByPlayer(
  breakdown: CircuitCeremonyBreakdown
): CircuitPlayerPointsCard[] {
  const ceremonyName = breakdown.ceremony.name ?? breakdown.ceremony.code ?? null;
  return breakdown.standings.map((row) => {
    const bySelection = new Map<
      number,
      {
        selection: CircuitSelectionSummary;
        nomination: number;
        win: number;
        held: boolean;
      }
    >();
    for (const e of row.entries) {
      const tally = bySelection.get(e.selection.id) ?? {
        selection: e.selection,
        nomination: 0,
        win: 0,
        held: e.owned_now
      };
      if (e.kind === "WIN") tally.win += cents(e.points);
      else tally.nomination += cents(e.points);
      bySelection.set(e.selection.id, tally);
    }
    const pills = [...bySelection.values()]
      .map((t): CircuitPointsPill => {
        const points = (t.nomination + t.win) / 100;
        return {
          key: String(t.selection.id),
          selection: t.selection,
          label: circuitSelectionLabel(t.selection),
          points,
          pointsLabel: circuitSignedPoints(points),
          winner: t.win > 0,
          dropped: !t.held,
          pointsSection: circuitPointsSection({
            playerName: row.member.username,
            lines: [
              {
                ceremony_id: breakdown.ceremony.id,
                ceremony_name: ceremonyName,
                nomination: t.nomination / 100,
                win: t.win / 100
              }
            ]
          })
        };
      })
      .sort(byPointsThenLabel);
    return {
      userId: row.member.user_id,
      username: row.member.username,
      avatarKey: row.member.avatar_key,
      rank: row.rank,
      title: rankedTitle(row.rank, row.member.username),
      total: row.points,
      totalLabel: plainPoints(row.points),
      summary: `Nominations ${circuitPointsLabel(row.nomination_points)} · Wins ${circuitPointsLabel(row.win_points)}`,
      pills,
      remainder: null
    };
  });
}

/** One scoring of a contender for one player, in the By category view. */
export type CircuitCategoryPointsEntry = {
  key: string;
  selection: CircuitSelectionSummary;
  label: string;
  userId: number;
  username: string;
  avatarKey: string | null;
  points: number;
  pointsLabel: string;
  dropped: boolean;
};

export type CircuitCategoryPointsRow = {
  id: number;
  name: string;
  iconCode: string | null;
  iconVariant: string;
  nominations: CircuitCategoryPointsEntry[];
  wins: CircuitCategoryPointsEntry[];
};

function byEntryPoints(a: CircuitCategoryPointsEntry, b: CircuitCategoryPointsEntry) {
  return (
    cents(b.points) - cents(a.points) ||
    a.label.localeCompare(b.label) ||
    a.username.localeCompare(b.username)
  );
}

/**
 * Ceremony points by category: every season category in order, with the
 * nominations and wins scored in it here, one entry per contender and
 * player. A category without entries stays, so the list is complete.
 */
export function circuitCeremonyPointsByCategory(
  breakdown: CircuitCeremonyBreakdown,
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "sort_index" | "icon_code" | "icon_variant"
  >[]
): CircuitCategoryPointsRow[] {
  const cells = new Map<string, CircuitCategoryPointsEntry>();
  const wins = new Set<string>();
  for (const row of breakdown.standings) {
    for (const e of row.entries) {
      const kind = e.kind === "WIN" ? "WIN" : "NOMINATION";
      const key = `${kind}-${row.member.user_id}-${e.selection.id}`;
      if (kind === "WIN") wins.add(key);
      const cell = cells.get(key) ?? {
        key,
        selection: e.selection,
        label: circuitSelectionLabel(e.selection),
        userId: row.member.user_id,
        username: row.member.username,
        avatarKey: row.member.avatar_key,
        points: 0,
        pointsLabel: "",
        dropped: !e.owned_now
      };
      cell.points = (cents(cell.points) + cents(e.points)) / 100;
      cell.pointsLabel = circuitSignedPoints(cell.points);
      cells.set(key, cell);
    }
  }
  const entries = [...cells.values()];
  return [...categories]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((category) => {
      const own = entries.filter((e) => e.selection.circuit_category_id === category.id);
      return {
        id: category.id,
        name: category.name,
        iconCode: category.icon_code,
        iconVariant: category.icon_variant,
        nominations: own.filter((e) => !wins.has(e.key)).sort(byEntryPoints),
        wins: own.filter((e) => wins.has(e.key)).sort(byEntryPoints)
      };
    });
}

/** A row of All scoring contenders. */
export type CircuitScoringContenderRow = {
  /** Shared by tied totals; the next rank skips (1, 1, 3). */
  rank: number;
  pill: CircuitPointsPill;
  players: Array<{
    userId: number;
    username: string;
    avatarKey: string | null;
    points: number;
    pointsLabel: string;
  }>;
};

/**
 * Every contender that scored in the season, by total then label, with the
 * players it scored for. The rows add up to the sum of the standings.
 */
export function circuitScoringContenderRows(
  contenders: readonly CircuitScoringContender[]
): CircuitScoringContenderRow[] {
  const sorted = contenders
    .map((c) => {
      const names = new Map(c.members.map((m) => [m.user_id, m.username]));
      const pill: CircuitPointsPill = {
        key: String(c.selection.id),
        selection: c.selection,
        label: circuitSelectionLabel(c.selection),
        points: c.total,
        pointsLabel: circuitSignedPoints(c.total),
        winner: c.lines.some((l) => cents(l.win) > 0),
        dropped: false,
        pointsSection: circuitPointsSection({
          playerName: null,
          lines: c.lines.map((l) => ({
            ...l,
            playerId: l.user_id,
            playerName: names.get(l.user_id) ?? null
          }))
        })
      };
      const players = c.members
        .map((m) => ({
          userId: m.user_id,
          username: m.username,
          avatarKey: m.avatar_key,
          points: m.points,
          pointsLabel: circuitSignedPoints(m.points)
        }))
        .sort(
          (a, b) =>
            cents(b.points) - cents(a.points) || a.username.localeCompare(b.username)
        );
      return { pill, players };
    })
    .sort((a, b) => byPointsThenLabel(a.pill, b.pill));
  return sorted.map((row) => ({
    rank: sorted.findIndex((r) => cents(r.pill.points) === cents(row.pill.points)) + 1,
    ...row
  }));
}

/**
 * Final rosters: every member's roster as it ended, in final rank order, each
 * pill with the season points it scored for that member, and the remainder
 * from picks they dropped, so each card adds up to their total.
 */
export function circuitFinalRosterCards(
  rosters: readonly CircuitRoster[],
  standings: readonly CircuitStandingRow[]
): CircuitPlayerPointsCard[] {
  const rankOf = new Map(standings.map((s, i) => [s.member.user_id, { row: s, i }]));
  return [...rosters]
    .sort((a, b) => {
      const ra = rankOf.get(a.member.user_id);
      const rb = rankOf.get(b.member.user_id);
      return (ra?.i ?? Number.MAX_SAFE_INTEGER) - (rb?.i ?? Number.MAX_SAFE_INTEGER);
    })
    .map((roster) => {
      const standing = rankOf.get(roster.member.user_id)?.row ?? null;
      const username = roster.member.username;
      return {
        userId: roster.member.user_id,
        username,
        avatarKey: standing?.member.avatar_key ?? null,
        rank: standing?.rank ?? null,
        title: rankedTitle(standing?.rank ?? null, username),
        total: roster.points_total,
        totalLabel: plainPoints(roster.points_total),
        summary: null,
        pills: roster.entries.map((e) => circuitRosterEntryPill(e, username)),
        remainder: circuitDroppedPointsNote(roster.dropped_points, "during")
      };
    });
}
