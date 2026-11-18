import { describe, expect, it } from "vitest";
import { circuitDraftClock } from "@/decisions/circuitDraft";
import {
  circuitHistoryRows,
  circuitMyRosterRows,
  circuitRoomHeader,
  circuitRoomStatus,
  circuitStagedRows
} from "@/decisions/circuitDraftRoom";
import {
  circuitDraftSnapshot,
  circuitLeagueDetail,
  circuitQueue,
  circuitSelection
} from "../circuitLeagues/fixtures";

const NOW = Date.parse("2026-11-28T18:05:00Z");
const detail = circuitLeagueDetail({ status: "DRAFTING" });

describe("circuit room status", () => {
  it("maps the lobby and every draft state onto the shared header's states", () => {
    expect(circuitRoomStatus(null)).toBe("PENDING");
    expect(circuitRoomStatus(circuitDraftSnapshot({ picks: 1 }))).toBe("IN_PROGRESS");
    expect(
      circuitRoomStatus(circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" }))
    ).toBe("IN_PROGRESS");
    expect(circuitRoomStatus(circuitDraftSnapshot({ picks: 1, status: "PAUSED" }))).toBe(
      "PAUSED"
    );
    expect(circuitRoomStatus(circuitDraftSnapshot())).toBe("COMPLETED");
  });
});

describe("circuit room header", () => {
  it("lists members by name in the lobby, with no seat on the clock", () => {
    const header = circuitRoomHeader({
      snapshot: null,
      members: [
        { user_id: 6, username: "blake", avatar_key: null },
        { user_id: 5, username: "avery", avatar_key: "owl" }
      ],
      viewerUserId: 5,
      clock: null
    });
    expect(header.status).toBe("PENDING");
    expect(header.participants).toEqual([
      { seatNumber: 1, label: "avery", active: false, avatarKey: "owl" },
      { seatNumber: 2, label: "blake", active: false, avatarKey: null }
    ]);
    expect(header).toMatchObject({
      roundNumber: null,
      pickNumber: null,
      isMyTurn: false,
      hasTimer: false,
      clockText: "—"
    });
  });

  it("shows seats in order, the round, pick, snake direction and the clock", () => {
    const base = circuitDraftSnapshot({ picks: 2 });
    const snapshot = {
      ...base,
      draft: { ...base.draft, pick_deadline_at: "2026-11-28T18:06:05Z" }
    };
    const header = circuitRoomHeader({
      snapshot,
      members: detail.members,
      viewerUserId: 6,
      clock: circuitDraftClock(snapshot, NOW)
    });
    expect(header.participants.map((p) => [p.label, p.active])).toEqual([
      ["avery", false],
      ["blake", true]
    ]);
    expect(header).toMatchObject({
      status: "IN_PROGRESS",
      roundNumber: 2,
      pickNumber: 3,
      direction: "REVERSE",
      isMyTurn: true,
      hasTimer: true,
      timerRemainingMs: 65_000,
      clockText: "1:05"
    });
  });

  it("gives the supplemental round no round number or direction", () => {
    const snapshot = circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" });
    const header = circuitRoomHeader({
      snapshot,
      members: detail.members,
      viewerUserId: 5,
      clock: null
    });
    expect(header).toMatchObject({
      roundNumber: null,
      direction: null,
      pickNumber: 5,
      isMyTurn: false,
      clockText: "—"
    });
  });
});

describe("circuit history rows", () => {
  it("lists picks, the slot on the clock and the regular slots to come", () => {
    const rows = circuitHistoryRows(
      circuitDraftSnapshot({ picks: 2 }),
      detail.categories
    );
    expect(rows.map((r) => [r.roundPick, r.username, r.label, r.active])).toEqual([
      ["1-1", "avery", "Sunset Boulevard (2026)", false],
      ["1-2", "blake", "All About Eve (2026)", false],
      ["2-1", "blake", "—", true],
      ["2-2", "avery", "—", false]
    ]);
    expect(rows[0]).toMatchObject({ picked: true, categoryName: "Best Picture" });
    expect(rows[2]).toMatchObject({ picked: false, missed: false });
  });

  it("marks missed and queued picks, and adds supplemental slots as S-n", () => {
    const rows = circuitHistoryRows(circuitDraftSnapshot(), detail.categories);
    expect(rows.map((r) => r.roundPick)).toEqual(["1-1", "1-2", "2-1", "2-2", "S-1"]);
    expect(rows[2]).toMatchObject({ label: "Missed", missed: true, picked: false });
    expect(rows[3]).toMatchObject({ auto: true, picked: true });
    expect(rows[4]).toMatchObject({ username: "blake", missed: true, active: false });

    const live = circuitHistoryRows(
      circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" }),
      detail.categories
    );
    expect(live.at(-1)).toMatchObject({ roundPick: "S-1", active: true, label: "—" });
  });

  it("keeps the viewer's drafted contenders for the roster rail", () => {
    const rows = circuitMyRosterRows(circuitDraftSnapshot(), detail.categories, 5);
    expect(rows.map((r) => r.label)).toEqual([
      "Sunset Boulevard (2026)",
      "Ingrid Bergman, Gaslight (2026)"
    ]);
    expect(circuitMyRosterRows(circuitDraftSnapshot(), detail.categories, 99)).toEqual(
      []
    );
  });
});

describe("circuit staged rows", () => {
  it("labels staged contenders with their category and marks drafted ones", () => {
    const queue = circuitQueue(
      [],
      [circuitSelection(32, "All About Eve"), circuitSelection(35, "Rebecca")]
    );
    const rows = circuitStagedRows(
      queue,
      detail.categories,
      circuitDraftSnapshot({ picks: 2 })
    );
    expect(rows.map((r) => [r.label, r.categoryName, r.drafted])).toEqual([
      ["All About Eve (2026)", "Best Picture", true],
      ["Rebecca (2026)", "Best Picture", false]
    ]);
  });
});
