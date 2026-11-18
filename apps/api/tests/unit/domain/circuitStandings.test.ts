import { describe, expect, it } from "vitest";
import { rankStandings } from "../../../src/domain/circuitScoring.js";

const members = [
  { id: 1, username: "carol" },
  { id: 2, username: "alice" },
  { id: 3, username: "bob" }
];

const entry = (member_id: number, kind: "NOMINATION" | "WIN", points: number) => ({
  member_id,
  kind,
  points
});

describe("rankStandings", () => {
  it("sums each member's entries by kind, highest total first", () => {
    const rows = rankStandings(members, [
      entry(1, "NOMINATION", 1),
      entry(3, "NOMINATION", 1),
      entry(3, "WIN", 2),
      entry(2, "NOMINATION", 1.5)
    ]);
    expect(
      rows.map((r) => [
        r.rank,
        r.member.username,
        r.points,
        r.nomination_points,
        r.win_points
      ])
    ).toEqual([
      [1, "bob", 3, 1, 2],
      [2, "alice", 1.5, 1.5, 0],
      [3, "carol", 1, 1, 0]
    ]);
  });

  it("shares a rank between tied members, ordered by username, then skips", () => {
    const rows = rankStandings(members, [entry(1, "WIN", 2), entry(2, "WIN", 2)]);
    expect(rows.map((r) => [r.rank, r.member.username, r.points])).toEqual([
      [1, "alice", 2],
      [1, "carol", 2],
      [3, "bob", 0]
    ]);
  });

  it("keeps members without entries on 0 and ignores entries of non-members", () => {
    const rows = rankStandings(members, [entry(9, "WIN", 5)]);
    expect(rows.map((r) => [r.rank, r.member.id, r.points])).toEqual([
      [1, 2, 0],
      [1, 3, 0],
      [1, 1, 0]
    ]);
  });

  it("sums weighted points exactly, without floating-point drift", () => {
    const rows = rankStandings(
      [members[0]!],
      Array.from({ length: 10 }, () => entry(1, "NOMINATION", 0.1))
    );
    expect(rows[0]!.points).toBe(1);
  });
});
