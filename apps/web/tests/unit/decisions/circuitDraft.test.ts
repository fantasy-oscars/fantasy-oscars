import { describe, expect, it } from "vitest";
import {
  applyCircuitDraftEvent,
  circuitDraftClock,
  circuitDraftRoundNote,
  circuitPickGate,
  circuitSelectionDrafted,
  circuitTurnAnnouncement,
  circuitBoardByCategory,
  circuitBoardBySeat,
  circuitBoardCells,
  circuitDraftErrorMessage,
  circuitDraftLinkLabel,
  circuitDraftLobbyFacts,
  circuitDraftPhase,
  circuitDraftSlotLabel,
  circuitDraftStartNote,
  circuitOnTheClockLabel,
  circuitQueueMoved,
  circuitQueueRows
} from "@/decisions/circuitDraft";
import {
  circuitDraftSnapshot,
  circuitLeagueDetail,
  circuitQueue,
  circuitSelection
} from "../circuitLeagues/fixtures";

const categories = circuitLeagueDetail().categories;

describe("circuit draft phase", () => {
  it("is the lobby until there is a snapshot, then follows the draft", () => {
    expect(circuitDraftPhase(null)).toBe("lobby");
    expect(circuitDraftPhase(circuitDraftSnapshot({ picks: 1 }))).toBe("live");
    expect(
      circuitDraftPhase(circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" }))
    ).toBe("live");
    expect(circuitDraftPhase(circuitDraftSnapshot({ picks: 2, status: "PAUSED" }))).toBe(
      "paused"
    );
    expect(circuitDraftPhase(circuitDraftSnapshot())).toBe("completed");
  });

  it("links the season page to the lobby, the room or the finished board", () => {
    expect(circuitDraftLinkLabel("SETUP")).toBe("Draft lobby");
    expect(circuitDraftLinkLabel("INITIALIZED")).toBe("Draft lobby");
    expect(circuitDraftLinkLabel("DRAFTING")).toBe("Draft room");
    expect(circuitDraftLinkLabel("IN_SEASON")).toBe("Draft board");
  });
});

describe("circuit draft slots", () => {
  it("names regular slots by round and supplemental slots by the pick they make up", () => {
    const base = { seatCount: 4, rounds: 3 };
    expect(circuitDraftSlotLabel({ ...base, pickNumber: 1, originalPickNumber: 1 })).toBe(
      "Round 1, pick 1"
    );
    expect(circuitDraftSlotLabel({ ...base, pickNumber: 5, originalPickNumber: 5 })).toBe(
      "Round 2, pick 5"
    );
    expect(
      circuitDraftSlotLabel({ ...base, pickNumber: 12, originalPickNumber: 12 })
    ).toBe("Round 3, pick 12");
    expect(
      circuitDraftSlotLabel({ ...base, pickNumber: 13, originalPickNumber: 6 })
    ).toBe("Supplemental, for pick 6");
  });

  it("says who is on the clock, and nothing once the draft is over", () => {
    expect(circuitOnTheClockLabel(circuitDraftSnapshot({ picks: 2 }))).toBe(
      "Round 2, pick 3 · blake"
    );
    expect(circuitOnTheClockLabel(circuitDraftSnapshot({ picks: 4 }))).toBe(
      "Supplemental, for pick 3 · blake"
    );
    expect(circuitOnTheClockLabel(circuitDraftSnapshot())).toBeNull();
  });
});

describe("circuit draft board", () => {
  it("labels picks, queue picks, missed picks and the supplemental round", () => {
    const cells = circuitBoardCells(circuitDraftSnapshot(), categories);
    expect(cells.map((c) => c.label)).toEqual([
      "Sunset Boulevard (2026)",
      "All About Eve (2026)",
      "Missed",
      "Ingrid Bergman, Gaslight (2026)",
      "Missed"
    ]);
    expect(cells[0]).toMatchObject({ auto: false, categoryName: "Best Picture" });
    expect(cells[3]).toMatchObject({ auto: true, categoryName: "Best Actress" });
    expect(cells[2]).toMatchObject({
      missed: true,
      supplemental: false,
      note: "Made up in the supplemental round"
    });
    expect(cells[4]).toMatchObject({
      missed: true,
      supplemental: true,
      slotLabel: "Supplemental, for pick 3",
      note: "Missed again, so a chip for pick 3"
    });
  });

  it("promises the supplemental pick while it is still to come", () => {
    const cells = circuitBoardCells(circuitDraftSnapshot({ picks: 3 }), categories);
    expect(cells[2]!.note).toBe("A supplemental pick follows the last round");
  });

  it("groups by seat in draft order, counting drafted picks only", () => {
    const seats = circuitBoardBySeat(circuitDraftSnapshot({ picks: 4 }), categories, 5);
    expect(seats.map((s) => [s.username, s.isViewer, s.countLabel])).toEqual([
      ["avery", true, "2 of 2"],
      ["blake", false, "1 of 2"]
    ]);
    expect(seats[1]!.onTheClock).toBe(true);
    expect(seats[1]!.cells.map((c) => c.pickNumber)).toEqual([2, 3]);
  });

  it("groups drafted picks by category in the league's order", () => {
    const byCategory = circuitBoardByCategory(
      circuitDraftSnapshot(),
      [...categories].reverse()
    );
    expect(byCategory.map((c) => [c.name, c.cells.map((x) => x.username)])).toEqual([
      ["Best Picture", ["avery", "blake"]],
      ["Best Actress", ["avery"]]
    ]);
  });
});

describe("circuit draft lobby", () => {
  it("explains who starts the draft and when", () => {
    expect(circuitDraftStartNote({ status: "SETUP", canManage: false })).toMatch(
      /once the commissioner locks the season/
    );
    expect(circuitDraftStartNote({ status: "INITIALIZED", canManage: true })).toMatch(
      /^Start the draft when everyone is ready/
    );
    expect(circuitDraftStartNote({ status: "INITIALIZED", canManage: false })).toMatch(
      /^The commissioner starts the draft/
    );
  });

  it("lists rounds, order, clock and auto-draft", () => {
    expect(
      circuitDraftLobbyFacts({
        roster_size: 16,
        pick_timer_seconds: 90,
        auto_draft_enabled: true
      })
    ).toEqual([
      { label: "Rounds", value: "16" },
      { label: "Order", value: "Snake, drawn at random" },
      { label: "Pick clock", value: "90 seconds" },
      { label: "Auto-draft", value: "From your queue when the clock runs out" }
    ]);
    const untimed = circuitDraftLobbyFacts({
      roster_size: 8,
      pick_timer_seconds: 0,
      auto_draft_enabled: false
    });
    expect(untimed[2]!.value).toBe("No clock");
    expect(untimed[3]!.value).toMatch(/^Off/);
  });
});

describe("circuit draft queue", () => {
  const queue = circuitQueue([
    circuitSelection(33, "Gaslight", "Ingrid Bergman"),
    circuitSelection(31, "Sunset Boulevard"),
    circuitSelection(34, "Laura")
  ]);

  it("lists the queue top first with categories, marking drafted contenders", () => {
    const rows = circuitQueueRows(queue, categories, circuitDraftSnapshot({ picks: 2 }));
    expect(rows.map((r) => [r.label, r.categoryName, r.drafted])).toEqual([
      ["Ingrid Bergman, Gaslight (2026)", "Best Actress", false],
      ["Sunset Boulevard (2026)", "Best Picture", true],
      ["Laura (2026)", "Best Picture", false]
    ]);
    expect(circuitQueueRows(queue, categories, null).some((r) => r.drafted)).toBe(false);
  });

  it("moves a dragged row to the place of the row it lands on", () => {
    expect(circuitQueueMoved([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(circuitQueueMoved([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(circuitQueueMoved([1, 2, 3], 2, 2)).toBeNull();
    expect(circuitQueueMoved([1, 2, 3], 9, 2)).toBeNull();
  });

  it("explains queue failures in player terms", () => {
    expect(
      circuitDraftErrorMessage({ errorCode: "CIRCUIT_QUEUE_CHANGED" }, "Could not")
    ).toMatch(/changed in another window/);
    expect(circuitDraftErrorMessage({ message: "Server says no" }, "Could not")).toBe(
      "Server says no"
    );
    expect(circuitDraftErrorMessage({}, "Could not")).toBe("Could not");
  });
});

describe("live circuit draft events", () => {
  const event = (version: number, extra: object = {}) => {
    const next = circuitDraftSnapshot({ picks: 2 });
    return {
      draft_id: 9,
      circuit_league_id: 4,
      version,
      event_type: "draft.pick.made",
      payload: {
        draft: { ...next.draft },
        on_the_clock: next.on_the_clock,
        pick: next.picks[1]!,
        selection: circuitSelection(32, "All About Eve"),
        ...extra
      },
      created_at: "2026-11-28T18:01:00Z",
      server_time: "2026-11-28T18:01:02Z"
    };
  };

  it("applies only the next version: the pick, its selection, the clock and the draft", () => {
    const before = circuitDraftSnapshot({ picks: 1 });
    const outcome = applyCircuitDraftEvent(before, event(3));
    if (outcome.kind !== "applied") throw new Error(outcome.kind);
    expect(outcome.snapshot.draft.version).toBe(3);
    expect(outcome.snapshot.draft.current_pick_number).toBe(3);
    expect(outcome.snapshot.picks.map((p) => p.pick_number)).toEqual([1, 2]);
    expect(outcome.snapshot.selections.map((s) => s.id)).toEqual([31, 32]);
    expect(outcome.snapshot.on_the_clock?.seat_number).toBe(2);
    expect(outcome.snapshot.server_time).toBe("2026-11-28T18:01:02Z");
    // The original is untouched.
    expect(before.picks).toHaveLength(1);
  });

  it("ignores a version it already has and resyncs on a gap or with no board", () => {
    const before = circuitDraftSnapshot({ picks: 1 });
    expect(applyCircuitDraftEvent(before, event(2)).kind).toBe("stale");
    expect(applyCircuitDraftEvent(before, event(4)).kind).toBe("resync");
    expect(applyCircuitDraftEvent(null, event(1)).kind).toBe("resync");
    expect(applyCircuitDraftEvent(before, { ...event(3), draft_id: 10 }).kind).toBe(
      "resync"
    );
  });

  it("appends a chip from a missed supplemental pick and replaces the seats on start", () => {
    const before = circuitDraftSnapshot({ picks: 1 });
    const chip = { id: 7, member_id: 42, original_pick_number: 3, status: "ACTIVE" };
    const seats = [...before.seats].reverse();
    const outcome = applyCircuitDraftEvent(before, event(3, { chip, seats }));
    if (outcome.kind !== "applied") throw new Error(outcome.kind);
    expect(outcome.snapshot.chips).toEqual([chip]);
    expect(outcome.snapshot.seats).toEqual(seats);
  });

  it("knows a drafted selection", () => {
    const snapshot = circuitDraftSnapshot({ picks: 2 });
    expect(circuitSelectionDrafted(snapshot, 32)).toBe(true);
    expect(circuitSelectionDrafted(snapshot, 34)).toBe(false);
  });
});

describe("circuit pick clock", () => {
  const at = (iso: string) => Date.parse(iso);
  const running = (deadline: string | null, timer = 90) => {
    const snapshot = circuitDraftSnapshot({ picks: 1 });
    return {
      ...snapshot,
      draft: { ...snapshot.draft, pick_deadline_at: deadline, pick_timer_seconds: timer }
    };
  };

  it("counts down to the deadline on the server's clock and turns urgent at ten seconds", () => {
    const snapshot = running("2026-11-28T18:01:05Z");
    expect(circuitDraftClock(snapshot, at("2026-11-28T18:00:00Z"))).toEqual({
      label: "1:05 left",
      secondsLeft: 65,
      urgent: false
    });
    expect(circuitDraftClock(snapshot, at("2026-11-28T18:00:56Z")).urgent).toBe(true);
    expect(circuitDraftClock(snapshot, at("2026-11-28T18:02:00Z")).label).toBe(
      "0:00 left"
    );
  });

  it("shows the time a paused draft will resume with, and no clock when untimed", () => {
    const paused = running("2026-11-28T18:01:00Z");
    paused.draft = {
      ...paused.draft,
      status: "PAUSED",
      paused_at: "2026-11-28T18:00:18Z"
    };
    expect(circuitDraftClock(paused, at("2026-11-28T18:30:00Z")).label).toBe(
      "Paused with 0:42 left"
    );
    expect(circuitDraftClock(running(null, 0), 0).label).toBe("No pick clock");
    expect(circuitDraftClock(circuitDraftSnapshot(), 0).label).toBeNull();
  });
});

describe("circuit pick gate", () => {
  // Pick 2 belongs to seat 2, blake (user 6); avery is user 5.
  const snapshot = circuitDraftSnapshot({ picks: 1 });

  it("lets only the player on the clock pick, and tells the others whose pick it is", () => {
    expect(
      circuitPickGate({ snapshot, viewerUserId: 6, connectionBlockedReason: null })
    ).toEqual({ onTheClock: true, canPick: true, reason: "You're on the clock." });
    expect(
      circuitPickGate({ snapshot, viewerUserId: 5, connectionBlockedReason: null })
    ).toEqual({
      onTheClock: false,
      canPick: false,
      reason: "Waiting for blake to pick."
    });
  });

  it("blocks the player on the clock while paused or disconnected", () => {
    const paused = {
      ...snapshot,
      draft: { ...snapshot.draft, status: "PAUSED" as const }
    };
    expect(
      circuitPickGate({
        snapshot: paused,
        viewerUserId: 6,
        connectionBlockedReason: null
      }).reason
    ).toMatch(/paused/);
    const offline = circuitPickGate({
      snapshot,
      viewerUserId: 6,
      connectionBlockedReason: "Reconnecting to the draft."
    });
    expect(offline).toEqual({
      onTheClock: true,
      canPick: false,
      reason: "Reconnecting to the draft."
    });
  });

  it("names the supplemental pick and closes once the draft is complete", () => {
    const supplemental = circuitDraftSnapshot({ picks: 4, status: "SUPPLEMENTAL" });
    expect(
      circuitPickGate({
        snapshot: supplemental,
        viewerUserId: 6,
        connectionBlockedReason: null
      }).reason
    ).toBe("You're on the clock for your supplemental pick.");
    expect(circuitDraftRoundNote(supplemental)).toMatch(/^Supplemental round/);
    expect(circuitDraftRoundNote(snapshot)).toBeNull();
    expect(
      circuitPickGate({
        snapshot: circuitDraftSnapshot(),
        viewerUserId: 6,
        connectionBlockedReason: null
      })
    ).toMatchObject({ canPick: false, reason: "The draft is complete." });
  });

  it("announces whose pick it is, as the viewer's own or by name", () => {
    expect(circuitTurnAnnouncement(snapshot, 6)).toBe(
      "Your pick. Round 1, pick 2 · blake"
    );
    expect(circuitTurnAnnouncement(snapshot, 5)).toBe(
      "On the clock: Round 1, pick 2 · blake"
    );
    expect(circuitTurnAnnouncement(null, 5)).toBe("");
    expect(circuitTurnAnnouncement(circuitDraftSnapshot(), 5)).toBe(
      "The draft is complete."
    );
  });

  it("explains refused picks", () => {
    expect(
      circuitDraftErrorMessage({ errorCode: "CIRCUIT_DRAFT_NOT_YOUR_TURN" }, "x")
    ).toMatch(/isn't your pick/);
    expect(
      circuitDraftErrorMessage({ errorCode: "CIRCUIT_SELECTION_TAKEN" }, "x")
    ).toMatch(/already drafted/);
    expect(circuitDraftErrorMessage({ errorCode: "RATE_LIMITED" }, "x")).toMatch(
      /Too many/
    );
  });
});
