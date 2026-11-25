import { describe, expect, it } from "vitest";
import {
  circuitCeremonyPointsByCategory,
  circuitCeremonyPointsByPlayer,
  circuitDroppedPointsNote,
  circuitFinalRosterCards,
  circuitPointsDetail,
  circuitPointsSection,
  circuitRosterEntryPill,
  circuitRosterPicks,
  circuitRosterPointsMeta,
  circuitScoringContenderRows,
  circuitSignedPoints
} from "@/decisions/circuitPoints";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";
import {
  LEDGER,
  MEMBERS,
  SEASON,
  breakdownFor,
  contenders,
  rosterFor,
  sum
} from "../circuitLeagues/seededLedger";

describe("circuit signed points", () => {
  it("signs a figure like the ceremony roster, to two decimals", () => {
    expect(circuitSignedPoints(3)).toBe("+3");
    expect(circuitSignedPoints(0)).toBe("0");
    expect(circuitSignedPoints(-0)).toBe("0");
    expect(circuitSignedPoints(4.5)).toBe("+4.5");
    expect(circuitSignedPoints(0.125)).toBe("+0.13");
    expect(circuitSignedPoints(1.1 + 2.2)).toBe("+3.3");
    expect(circuitSignedPoints(-1)).toBe("−1");
  });

  it("describes a ceremony line, leaving out a part that scored nothing", () => {
    expect(circuitPointsDetail({ nomination: 1, win: 2 })).toBe("Nomination +1 · Win +2");
    expect(circuitPointsDetail({ nomination: 1.5, win: 0 })).toBe("Nomination +1.5");
    expect(circuitPointsDetail({ nomination: 0, win: 2 })).toBe("Win +2");
  });
});

describe("circuit points section", () => {
  it("heads a player's breakdown and adds a total line from two lines", () => {
    const section = circuitPointsSection({
      playerName: "bob",
      lines: rosterFor(6).entries[1]!.points.by_ceremony
    });
    expect(section.heading).toBe("Points for bob");
    expect(section.lines.map((l) => [l.label, l.detail, l.total])).toEqual([
      ["Golden Reel 2027", "Nomination +1 · Win +2", "+3"],
      ["Directors Guild", "Nomination +1.5", "+1.5"]
    ]);
    expect(section.total).toBe("+4.5");
    expect(section.emptyText).toBeNull();
  });

  it("has no total line for one line, and says so when there are none", () => {
    const one = circuitPointsSection({
      playerName: "alice",
      lines: [{ ceremony_id: 1, ceremony_name: null, nomination: 1, win: 0 }]
    });
    expect(one.lines[0]!.label).toBe("Ceremony");
    expect(one.total).toBeNull();
    const none = circuitPointsSection({ playerName: null, lines: [] });
    expect(none.heading).toBe("Points");
    expect(none.emptyText).toBe("No points yet.");
  });

  it("names the player on each line in the contender-level view", () => {
    const section = circuitPointsSection({
      playerName: null,
      lines: [
        {
          ceremony_id: 1,
          ceremony_name: "Northlight Awards 2035",
          nomination: 1,
          win: 0,
          playerId: 9,
          playerName: "pia"
        }
      ]
    });
    expect(section.lines[0]!.label).toBe("Northlight Awards 2035 · pia");
    expect(section.lines[0]!.detail).toBe("Nomination +1");
  });
});

describe("circuit roster points", () => {
  it("gives each pill its points for this player, gold if it won for them", () => {
    const bob = rosterFor(6);
    const pills = bob.entries.map((e) => circuitRosterEntryPill(e, "bob"));
    expect(pills.map((p) => [p.label, p.pointsLabel, p.winner])).toEqual([
      ["Night Train (2026)", "+2", true],
      ["Ada Lane, Paper Moon (2026)", "+4.5", true]
    ]);
    // Each pill's breakdown total equals its figure.
    expect(pills[1]!.pointsSection.total).toBe(pills[1]!.pointsLabel);
    expect(circuitRosterPointsMeta(bob)).toBe("2 of 4 · 6.5 pts so far");
  });

  it("adds every roster's pills and dropped points up to the ledger and the standings", () => {
    for (const member of MEMBERS) {
      const roster = rosterFor(member.user_id);
      const pills = roster.entries.map((e) => circuitRosterEntryPill(e, member.username));
      const standing = SEASON.find((s) => s.member.user_id === member.user_id)!;
      expect(sum([...pills.map((p) => p.points), roster.dropped_points])).toBe(
        standing.points
      );
      expect(roster.points_total).toBe(standing.points);
    }
  });

  it("gives the roster page's picks the standings breakdown's points per nominee", () => {
    const breakdowns = [breakdownFor(1), breakdownFor(2)];
    const categories = circuitLeagueDetail({ status: "IN_SEASON" }).categories;
    for (const member of MEMBERS) {
      const picks = circuitRosterPicks(rosterFor(member.user_id), categories);
      for (const pick of picks.values()) {
        const fromBreakdown = breakdowns.flatMap((b) =>
          b.standings
            .filter((s) => s.member.user_id === member.user_id)
            .flatMap((s) => s.entries)
            .filter((e) => e.selection.id === pick.entry.selection.id)
            .map((e) => e.points)
        );
        expect(pick.pill.points).toBe(sum(fromBreakdown));
        expect(pick.pill.pointsSection.heading).toBe(`Points for ${member.username}`);
        expect(pick.view.iconCode).toBe(
          categories.find((c) => c.id === pick.entry.selection.circuit_category_id)!
            .icon_code
        );
      }
    }
  });

  it("states the dropped remainder, and nothing at zero", () => {
    expect(circuitDroppedPointsNote(rosterFor(5).dropped_points, "earlier")).toBe(
      "Plus 1 pt from picks dropped earlier in the season."
    );
    expect(circuitDroppedPointsNote(2, "during")).toBe(
      "Plus 2 pts from picks dropped during the season."
    );
    expect(circuitDroppedPointsNote(0, "earlier")).toBeNull();
  });
});

describe("circuit ceremony points by player", () => {
  const cards = circuitCeremonyPointsByPlayer(breakdownFor(1));

  it("lists members in rank order with their ceremony totals", () => {
    expect(cards.map((c) => [c.title, c.totalLabel, c.summary])).toEqual([
      ["1. bob", "5", "Nominations 1 pt · Wins 4 pts"],
      ["2. alice", "2", "Nominations 2 pts · Wins 0 pts"],
      ["3. cy", "0", "Nominations 0 pts · Wins 0 pts"]
    ]);
    expect(cards[2]!.pills).toEqual([]);
  });

  it("gives one pill per contender, nomination plus win, by points then label", () => {
    expect(cards[0]!.pills.map((p) => [p.label, p.pointsLabel, p.winner])).toEqual([
      ["Ada Lane, Paper Moon (2026)", "+3", true],
      ["Night Train (2026)", "+2", true]
    ]);
    expect(cards[0]!.pills[0]!.pointsSection.lines[0]!.detail).toBe(
      "Nomination +1 · Win +2"
    );
  });

  it("keeps a pick dropped since, marked, so the pills add up to the total", () => {
    const alice = cards[1]!;
    expect(alice.pills.map((p) => [p.label, p.dropped, p.winner])).toEqual([
      ["Night Train (2026)", true, false],
      ["Static (2026)", false, false]
    ]);
    for (const card of cards) {
      expect(sum(card.pills.map((p) => p.points))).toBe(card.total);
    }
  });
});

describe("circuit ceremony points by category", () => {
  const detail = circuitLeagueDetail({ status: "IN_SEASON" });

  it("gives every season category a card, in category order", () => {
    const cards = circuitCeremonyPointsByCategory(breakdownFor(1), detail.categories);
    expect(cards.map((c) => [c.name, c.iconCode])).toEqual([
      ["Best Picture", "movie"],
      ["Best Actress", "person"]
    ]);
  });

  it("merges a contender's nomination and win per player, winners first", () => {
    const [picture, actress] = circuitCeremonyPointsByCategory(
      breakdownFor(1),
      detail.categories
    );
    const rows = (card: typeof picture) =>
      card!.entries.map((e) => [e.label, e.username, e.pointsLabel, e.won, e.dropped]);
    expect(rows(picture)).toEqual([
      // The same contender appears once per player who scored with it.
      ["Night Train (2026)", "bob", "+2", true, false],
      ["Night Train (2026)", "alice", "+1", false, true],
      ["Static (2026)", "alice", "+1", false, false]
    ]);
    expect(picture!.pointsLabel).toBe("4");
    // bob's nomination and win for Paper Moon are one gold pill.
    expect(rows(actress)).toEqual([
      ["Ada Lane, Paper Moon (2026)", "bob", "+3", true, false]
    ]);
    const paperMoon = actress!.entries[0]!;
    expect([paperMoon.nomination, paperMoon.win]).toEqual([1, 2]);
    expect(paperMoon.pointsSection.heading).toBe("Points for bob");
    expect(paperMoon.pointsSection.lines.map((l) => [l.label, l.detail])).toEqual([
      ["Golden Reel 2027", "Nomination +1 · Win +2"]
    ]);
  });

  it("keeps a category without points, scored 0", () => {
    const score = {
      ...detail.categories[0]!,
      id: 99,
      name: "Best Score",
      sort_index: 99
    };
    const cards = circuitCeremonyPointsByCategory(breakdownFor(2), [
      ...detail.categories,
      score
    ]);
    const last = cards[cards.length - 1]!;
    expect([last.name, last.entries, last.points, last.pointsLabel]).toEqual([
      "Best Score",
      [],
      0,
      "0"
    ]);
  });

  it("matches the ledger: cards sum to the ceremony's points, entries to their card", () => {
    for (const ceremonyId of [1, 2]) {
      const b = breakdownFor(ceremonyId);
      const cards = circuitCeremonyPointsByCategory(b, detail.categories);
      for (const card of cards) {
        expect(sum(card.entries.map((e) => e.points))).toBe(card.points);
      }
      expect(sum(cards.map((c) => c.points))).toBe(sum(b.standings.map((s) => s.points)));
      expect(sum(cards.map((c) => c.points))).toBe(
        sum(LEDGER.filter((r) => r.ceremonyId === ceremonyId).map((r) => r.points))
      );
    }
  });
});

describe("circuit final results", () => {
  it("lists every scoring contender by total then label, ties sharing a rank", () => {
    const rows = circuitScoringContenderRows(contenders());
    expect(rows.map((r) => [r.rank, r.pill.label, r.pill.pointsLabel])).toEqual([
      [1, "Ada Lane, Paper Moon (2026)", "+4.5"],
      [2, "Night Train (2026)", "+3"],
      [3, "Moonrise (2026)", "+1"],
      [3, "Static (2026)", "+1"]
    ]);
    const nightTrain = rows[1]!;
    expect(nightTrain.pill.winner).toBe(true);
    expect(nightTrain.players.map((p) => [p.username, p.pointsLabel])).toEqual([
      ["bob", "+2"],
      ["alice", "+1"]
    ]);
    expect(nightTrain.pill.pointsSection.heading).toBe("Points");
    expect(nightTrain.pill.pointsSection.lines.map((l) => l.label)).toEqual([
      "Golden Reel 2027 · alice",
      "Golden Reel 2027 · bob"
    ]);
    expect(nightTrain.pill.pointsSection.total).toBe("+3");
    expect(rows[2]!.pill.winner).toBe(false);
  });

  it("adds every contender row up to the sum of the leaderboard", () => {
    const rows = circuitScoringContenderRows(contenders());
    expect(sum(rows.map((r) => r.pill.points))).toBe(sum(SEASON.map((s) => s.points)));
    expect(sum(rows.map((r) => r.pill.points))).toBe(sum(LEDGER.map((r) => r.points)));
  });

  it("orders final rosters by rank, each adding up to the player's total", () => {
    const cards = circuitFinalRosterCards(
      MEMBERS.map((m) => rosterFor(m.user_id)),
      SEASON
    );
    expect(cards.map((c) => [c.title, c.totalLabel, c.avatarKey])).toEqual([
      ["1. bob", "6.5", "fox"],
      ["2. alice", "2", "owl"],
      ["3. cy", "1", "bear"]
    ]);
    expect(cards[1]!.remainder).toBe("Plus 1 pt from picks dropped during the season.");
    expect(cards[0]!.remainder).toBeNull();
    expect(cards[0]!.pills[0]!.pointsSection.heading).toBe("Points for bob");
    for (const card of cards) {
      const roster = rosterFor(card.userId);
      expect(sum([...card.pills.map((p) => p.points), roster.dropped_points])).toBe(
        card.total
      );
    }
  });
});
