import { describe, expect, it } from "vitest";
import {
  ceremonyOrderOf,
  memberRosterPoints,
  scoringContenders,
  type PointsEntry
} from "../../../src/domain/circuitPoints.js";
import { rankStandings } from "../../../src/domain/circuitScoring.js";

const entry = (
  member_id: number,
  selection_id: number,
  ceremony_id: number,
  kind: "NOMINATION" | "WIN",
  points: number
): PointsEntry => ({ member_id, selection_id, ceremony_id, kind, points });

// Ceremony 20 comes before ceremony 10 in scoring order.
const order = new Map([
  [20, 0],
  [10, 1]
]);

// Member 1 held selection 100 for its nomination at both ceremonies, then
// dropped it; member 2 took it and scored its win at ceremony 20. Member 2
// holds selection 200 throughout; weights make some points fractional.
const ledger: PointsEntry[] = [
  entry(1, 100, 20, "NOMINATION", 1),
  entry(1, 100, 10, "NOMINATION", 1.5),
  entry(2, 100, 20, "WIN", 2),
  entry(2, 200, 10, "NOMINATION", 0.1),
  entry(2, 200, 10, "WIN", 0.2),
  entry(1, 300, 10, "NOMINATION", 1)
];

describe("memberRosterPoints", () => {
  it("gives each held selection its points while the member owned it, by ceremony", () => {
    const points = memberRosterPoints(ledger, 2, [200, 100, 400], order);
    expect(Object.fromEntries(points.by_selection)).toEqual({
      100: { total: 2, by_ceremony: [{ ceremony_id: 20, nomination: 0, win: 2 }] },
      200: { total: 0.3, by_ceremony: [{ ceremony_id: 10, nomination: 0.1, win: 0.2 }] },
      400: { total: 0, by_ceremony: [] }
    });
    expect(points.points_total).toBe(2.3);
    expect(points.dropped_points).toBe(0);
  });

  it("orders a selection's ceremonies by scoring order", () => {
    const points = memberRosterPoints(ledger, 1, [100], order);
    expect(points.by_selection.get(100)?.by_ceremony.map((c) => c.ceremony_id)).toEqual([
      20, 10
    ]);
  });

  it("counts dropped selections apart, so held points plus dropped equal the total", () => {
    const points = memberRosterPoints(ledger, 1, [300], order);
    expect(points.by_selection.get(300)?.total).toBe(1);
    expect(points.dropped_points).toBe(2.5);
    expect(points.points_total).toBe(3.5);
    for (const memberId of [1, 2]) {
      const p = memberRosterPoints(ledger, memberId, [300], order);
      const held = [...p.by_selection.values()].reduce((sum, s) => sum + s.total, 0);
      const standing = rankStandings(
        [
          { id: 1, username: "a" },
          { id: 2, username: "b" }
        ],
        ledger
      ).find((r) => r.member.id === memberId)!;
      expect(held + p.dropped_points).toBeCloseTo(p.points_total, 10);
      expect(p.points_total).toBe(standing.points);
    }
  });
});

describe("scoringContenders", () => {
  it("lists each scoring selection with its points per member and per ceremony and member", () => {
    expect(scoringContenders(ledger, order)).toEqual([
      {
        selection_id: 100,
        total: 4.5,
        members: [
          { member_id: 1, points: 2.5 },
          { member_id: 2, points: 2 }
        ],
        lines: [
          { ceremony_id: 20, member_id: 1, nomination: 1, win: 0 },
          { ceremony_id: 20, member_id: 2, nomination: 0, win: 2 },
          { ceremony_id: 10, member_id: 1, nomination: 1.5, win: 0 }
        ]
      },
      {
        selection_id: 300,
        total: 1,
        members: [{ member_id: 1, points: 1 }],
        lines: [{ ceremony_id: 10, member_id: 1, nomination: 1, win: 0 }]
      },
      {
        selection_id: 200,
        total: 0.3,
        members: [{ member_id: 2, points: 0.3 }],
        lines: [{ ceremony_id: 10, member_id: 2, nomination: 0.1, win: 0.2 }]
      }
    ]);
  });

  it("adds up to the sum of the standings, in hundredths", () => {
    const contenders = scoringContenders(ledger, order);
    const cents = contenders.reduce((sum, c) => sum + Math.round(c.total * 100), 0);
    const standings = rankStandings(
      [
        { id: 1, username: "a" },
        { id: 2, username: "b" }
      ],
      ledger
    );
    expect(cents).toBe(standings.reduce((sum, s) => sum + Math.round(s.points * 100), 0));
    for (const c of contenders) {
      const lines = c.lines.reduce(
        (sum, l) => sum + Math.round((l.nomination + l.win) * 100),
        0
      );
      expect(lines).toBe(Math.round(c.total * 100));
    }
  });

  it("puts ceremonies the order does not know last, by id, and is empty with no ledger", () => {
    const lines = scoringContenders(
      [entry(1, 1, 99, "NOMINATION", 1), entry(1, 1, 20, "NOMINATION", 1)],
      order
    )[0]!.lines;
    expect(lines.map((l) => l.ceremony_id)).toEqual([20, 99]);
    expect(scoringContenders([], order)).toEqual([]);
  });
});

describe("ceremonyOrderOf", () => {
  const ceremony = (
    ceremony_id: number,
    nominations_on: string | null,
    starts_at: string | null
  ) => ({
    ceremony_id,
    ceremony_code: null,
    ceremony_name: null,
    circuit_event_id: 1,
    event_code: "e",
    event_sort_index: 0,
    sort_index: ceremony_id,
    nominations_on,
    starts_at: starts_at === null ? null : new Date(starts_at)
  });

  it("orders ceremonies by their first occasion, undated last", () => {
    const result = ceremonyOrderOf([
      ceremony(1, "2026-02-01", "2026-03-15T00:00:00Z"),
      ceremony(2, "2026-01-10", "2026-02-20T00:00:00Z"),
      ceremony(3, null, null)
    ]);
    expect([...result.entries()]).toEqual([
      [2, 0],
      [1, 1],
      [3, 2]
    ]);
  });
});
