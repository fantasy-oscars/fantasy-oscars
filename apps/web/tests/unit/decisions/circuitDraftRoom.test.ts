import { describe, expect, it } from "vitest";
import { circuitDraftClock } from "@/decisions/circuitDraft";
import {
  circuitDraftedBy,
  circuitDraftPreview,
  circuitHistoryRows,
  circuitMyRosterRows,
  circuitRoomHeader,
  circuitRoomStatus,
  circuitSelectionClearedNote,
  circuitStagedRows,
  circuitStagingMenu,
  circuitStagingNote,
  circuitStagingPill
} from "@/decisions/circuitDraftRoom";
import type { CircuitDraftSnapshot } from "@/lib/types";
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

  it("carries each drafted slot's contender and the card's drafted chip", () => {
    const rows = circuitHistoryRows(circuitDraftSnapshot(), detail.categories);
    expect(rows[0]!.selection?.id).toBe(31);
    expect(rows[0]!.draftedRoundPick).toBe("1-1");
    expect(rows[3]!.draftedRoundPick).toBe("2-2 · from queue");
    expect(rows[2]!.selection).toBeNull();
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

describe("circuit staging note", () => {
  it("says how to draft from the lists while the viewer is on the clock", () => {
    const gate = { canPick: true, reason: "You're on the clock." };
    expect(circuitStagingNote({ gate, phone: false })).toBe(
      "You're on the clock. Double-click a contender to draft it, or select it and confirm."
    );
    expect(circuitStagingNote({ gate, phone: true })).toBe(
      "You're on the clock. Tap a contender, then Draft."
    );
  });

  it("otherwise says why not yet", () => {
    expect(
      circuitStagingNote({
        gate: { canPick: false, reason: "Waiting for emmy to pick." },
        phone: false
      })
    ).toBe("Waiting for emmy to pick. You can draft from here when you're on the clock.");
  });
});

/** blake made up missed pick 3 (round-pick 2-1) in the supplemental round. */
function madeUpSnapshot(): CircuitDraftSnapshot {
  const base = circuitDraftSnapshot();
  return {
    ...base,
    picks: base.picks.map((p) =>
      p.pick_number === 5
        ? { ...p, outcome: "PICKED", selection_id: 34, source: "MANUAL" }
        : p
    ),
    chips: [],
    selections: [...base.selections, circuitSelection(34, "Laura")]
  };
}

describe("circuit roster rail, supplemental pick", () => {
  it("shows a supplemental pick with the round-pick of the slot it made up", () => {
    const rows = circuitMyRosterRows(madeUpSnapshot(), detail.categories, 6);
    expect(rows.map((r) => [r.roundPick, r.label])).toEqual([
      ["1-2", "All About Eve (2026)"],
      ["2-1", "Laura (2026)"]
    ]);
    // The history keeps the record of the supplemental slot.
    expect(circuitHistoryRows(madeUpSnapshot(), detail.categories).at(-1)).toMatchObject({
      roundPick: "S-1",
      label: "Laura (2026)"
    });
  });
});

describe("circuit drafted by", () => {
  it("names who drafted each contender, with the avatar and the chip's round-pick", () => {
    const drafted = circuitDraftedBy(circuitDraftSnapshot(), detail.categories, [
      { user_id: 5, avatar_key: "owl" },
      { user_id: 6, avatar_key: null }
    ]);
    expect([...drafted.keys()]).toEqual([31, 32, 33]);
    expect(drafted.get(31)).toEqual({
      userId: 5,
      username: "avery",
      avatarKey: "owl",
      roundPick: "1-1"
    });
    expect(drafted.get(33)?.roundPick).toBe("2-2 · from queue");
  });
});

describe("circuit staging pill", () => {
  const base = {
    selectionId: 7,
    drafted: false,
    canDraft: true,
    armedId: null,
    pendingId: null
  };

  it("arms only for the viewer on the clock", () => {
    expect(circuitStagingPill(base)).toEqual({ state: "default", disabled: false });
    expect(circuitStagingPill({ ...base, armedId: 7 })).toEqual({
      state: "armed",
      disabled: false
    });
    expect(circuitStagingPill({ ...base, armedId: 8 }).state).toBe("default");
    expect(circuitStagingPill({ ...base, canDraft: false })).toEqual({
      state: "default",
      disabled: true
    });
  });

  it("mutes drafted contenders and holds every gesture while a request is in flight", () => {
    expect(circuitStagingPill({ ...base, drafted: true })).toEqual({
      state: "muted",
      disabled: true
    });
    expect(circuitStagingPill({ ...base, pendingId: 7, armedId: 7 })).toEqual({
      state: "pending",
      disabled: true
    });
    expect(circuitStagingPill({ ...base, pendingId: 8 })).toEqual({
      state: "default",
      disabled: true
    });
  });
});

describe("circuit staging menu", () => {
  const base = {
    list: "queue" as const,
    drafted: false,
    canDraft: false,
    busy: false,
    removing: false,
    index: 0,
    count: 3
  };
  const labels = (items: ReturnType<typeof circuitStagingMenu>) =>
    items.map((i) => (i.disabled ? `(${i.label})` : i.label));

  it("puts Draft first while the viewer can draft, then the queue's moves", () => {
    expect(labels(circuitStagingMenu({ ...base, canDraft: true }))).toEqual([
      "Draft",
      "(Move up)",
      "Move down",
      "Move to staged",
      "Remove from queue"
    ]);
    expect(labels(circuitStagingMenu({ ...base, index: 2 }))).toEqual([
      "Move up",
      "(Move down)",
      "Move to staged",
      "Remove from queue"
    ]);
  });

  it("offers the staged list's moves, and only Remove for a drafted contender", () => {
    expect(
      labels(circuitStagingMenu({ ...base, list: "staged", canDraft: true }))
    ).toEqual(["Draft", "Add to queue", "Remove from staged"]);
    expect(
      labels(circuitStagingMenu({ ...base, drafted: true, canDraft: true }))
    ).toEqual(["Remove from queue"]);
    expect(labels(circuitStagingMenu({ ...base, list: "staged", busy: true }))).toEqual([
      "(Add to queue)",
      "(Remove from staged)"
    ]);
  });
});

describe("circuit selection cleared", () => {
  it("says the armed contender is no longer available", () => {
    expect(circuitSelectionClearedNote("Laura (2026)")).toBe(
      "Selection cleared: Laura (2026) is no longer available"
    );
  });
});

describe("circuit draft preview", () => {
  const picture = { id: 20, name: "Best Picture", kind: "FILM" };
  const actress = { id: 21, name: "Best Actress", kind: "ACTING" };
  const film = (id: number, title: string) => ({
    tmdb_id: 1000 + id,
    title,
    release_year: 2026
  });
  const input = {
    categories: detail.categories,
    snapshot: circuitDraftSnapshot({ picks: 2 }),
    viewerUserId: 5,
    person: null
  };

  it("draws a free contender as a default pill with the category's icon", () => {
    expect(
      circuitDraftPreview({ ...input, category: picture, film: film(34, "Laura") })
    ).toEqual({
      label: "Laura (2026)",
      categoryName: "Best Picture",
      iconCode: "movie",
      iconVariant: "default",
      owned: false,
      caption: null,
      stateSuffix: null
    });
  });

  it("marks a drafted contender as owned, by someone else or by the viewer", () => {
    expect(
      circuitDraftPreview({
        ...input,
        category: picture,
        film: film(32, "All About Eve")
      })
    ).toMatchObject({
      owned: true,
      caption: "Owned by blake",
      stateSuffix: "owned by blake"
    });
    expect(
      circuitDraftPreview({
        ...input,
        category: picture,
        film: film(31, "Sunset Boulevard")
      })
    ).toMatchObject({ owned: true, caption: "Already on your roster" });
  });

  it("waits for the person in an acting category, and for a film", () => {
    const gaslight = film(33, "Gaslight");
    expect(
      circuitDraftPreview({ ...input, category: actress, film: gaslight })
    ).toBeNull();
    expect(
      circuitDraftPreview({
        ...input,
        category: actress,
        film: gaslight,
        person: { tmdb_id: 2033, name: "Ingrid Bergman" }
      })
    ).toMatchObject({ label: "Ingrid Bergman, Gaslight (2026)", iconCode: "person" });
    expect(circuitDraftPreview({ ...input, category: picture, film: null })).toBeNull();
  });
});
