import { describe, expect, it } from "vitest";
import {
  circuitLeagueChanges,
  circuitLeagueEditable,
  circuitLeagueEventDescription,
  circuitLeagueFormFrom,
  circuitLeagueCategoryValue,
  circuitLeagueEventValue,
  circuitLeagueMembershipNote,
  circuitLeagueStatusLabel,
  onOffLabel,
  pickClockLabel,
  DEFAULT_PICK_TIMER_SECONDS,
  hasCircuitLeagueChanges,
  startableCircuits
} from "@/decisions/circuitLeague";
import { computeLandingCircuitPreviews } from "@/decisions/landing/seasonPreviews";
import { statusTone } from "@/decisions/statusTone";
import type { CircuitLeagueSummary, CircuitSummary } from "@/lib/types";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";

describe("circuit league labels and editability", () => {
  it("labels every status with a pill text statusTone knows", () => {
    expect(circuitLeagueStatusLabel("SETUP")).toBe("Open");
    expect(circuitLeagueStatusLabel("INITIALIZED")).toBe("Pre-draft");
    expect(statusTone(circuitLeagueStatusLabel("DRAFTING")).tone).toBe("drafting");
    expect(statusTone(circuitLeagueStatusLabel("IN_SEASON")).tone).toBe("live");
    expect(statusTone(circuitLeagueStatusLabel("COMPLETE")).tone).toBe("complete");
  });

  it("follows owner question 11: all in setup, the clock until the draft, then nothing", () => {
    expect(circuitLeagueEditable("SETUP")).toEqual({ all: true, draftClock: true });
    expect(circuitLeagueEditable("INITIALIZED")).toEqual({
      all: false,
      draftClock: true
    });
    expect(circuitLeagueEditable("DRAFTING")).toEqual({ all: false, draftClock: false });
  });

  it("describes a grouped event by its ceremonies and a single one not at all", () => {
    const [single, group] = circuitLeagueDetail().events;
    expect(circuitLeagueEventDescription(single!)).toBeNull();
    expect(circuitLeagueEventDescription(group!)).toBe("Directors Guild, Actors Guild");
  });
});

describe("circuitLeagueChanges", () => {
  it("finds nothing to save in an untouched form", () => {
    const detail = circuitLeagueDetail();
    const changes = circuitLeagueChanges(detail, circuitLeagueFormFrom(detail));
    expect(hasCircuitLeagueChanges(changes)).toBe(false);
  });

  it("patches only the changed settings, with values as typed", () => {
    const detail = circuitLeagueDetail();
    const form = {
      ...circuitLeagueFormFrom(detail),
      rosterSize: "12",
      autoDraftEnabled: false
    };
    expect(circuitLeagueChanges(detail, form)).toEqual({
      settings: { roster_size: "12", auto_draft_enabled: false },
      events: null,
      categories: null
    });
  });

  it("sends null to turn the pick timer off and offers the default when it is off", () => {
    const detail = circuitLeagueDetail();
    const off = { ...circuitLeagueFormFrom(detail), timerEnabled: false };
    expect(circuitLeagueChanges(detail, off).settings).toEqual({
      pick_timer_seconds: null
    });

    const untimed = circuitLeagueDetail();
    untimed.circuit_league.pick_timer_seconds = null;
    const form = circuitLeagueFormFrom(untimed);
    expect(form.timerEnabled).toBe(false);
    expect(form.pickTimerSeconds).toBe(DEFAULT_PICK_TIMER_SECONDS);
    expect(hasCircuitLeagueChanges(circuitLeagueChanges(untimed, form))).toBe(false);
  });

  it("toggles a grouped event as one unit and sends the full enabled list", () => {
    const detail = circuitLeagueDetail();
    const base = circuitLeagueFormFrom(detail);
    const form = {
      ...base,
      events: {
        ...base.events,
        11: { enabled: false, weight: 1 },
        10: { enabled: true, weight: 2 }
      }
    };
    expect(circuitLeagueChanges(detail, form).events).toEqual([
      { circuit_event_id: 10, weight: 2 }
    ]);
  });

  it("can save no events at all", () => {
    const detail = circuitLeagueDetail();
    const base = circuitLeagueFormFrom(detail);
    const form = {
      ...base,
      events: { 10: { enabled: false, weight: 1 }, 11: { enabled: false, weight: 1 } }
    };
    expect(circuitLeagueChanges(detail, form).events).toEqual([]);
  });

  it("ignores the weight of a disabled event", () => {
    const detail = circuitLeagueDetail();
    detail.events[1]!.enabled = false;
    const base = circuitLeagueFormFrom(detail);
    const form = {
      ...base,
      events: { ...base.events, 11: { enabled: false, weight: 3 } }
    };
    expect(circuitLeagueChanges(detail, form).events).toBeNull();
  });

  it("sends only changed categories, an empty limit as none", () => {
    const detail = circuitLeagueDetail();
    detail.categories[1]!.max_owned = 2;
    const base = circuitLeagueFormFrom(detail);
    expect(base.categories[21]!.maxOwned).toBe(2);
    const form = {
      ...base,
      categories: {
        20: { weight: 1.5, maxOwned: "" },
        21: { weight: 1, maxOwned: "" }
      }
    };
    expect(circuitLeagueChanges(detail, form).categories).toEqual([
      { circuit_category_id: 20, weight: 1.5, max_owned: null },
      { circuit_category_id: 21, weight: 1, max_owned: null }
    ]);
  });
});

function summary(overrides: Partial<CircuitLeagueSummary>): CircuitLeagueSummary {
  return {
    ...circuitLeagueDetail().circuit_league,
    circuit_code: "awards",
    circuit_name: "Awards Season",
    circuit_status: "ACTIVE",
    member_count: 1,
    is_member: true,
    ...overrides
  };
}

describe("circuit lists", () => {
  it("offers only active Circuits not yet started in the league", () => {
    const circuits = [1, 2, 3].map((id): CircuitSummary => ({
      id,
      code: `c${id}`,
      name: `C${id}`,
      status: id === 3 ? "ARCHIVED" : "ACTIVE",
      opens_on: null,
      activated_at: null
    }));
    expect(startableCircuits(circuits, [{ circuit_id: 1 }]).map((c) => c.id)).toEqual([
      2
    ]);
  });

  it("shows on Home only the viewer's own competitions in running Circuits, newest first", () => {
    const league = { id: 3, code: "club", name: "Film Club", ceremony_id: null };
    const previews = computeLandingCircuitPreviews([
      {
        league,
        circuitLeagues: [
          summary({ id: 1, created_at: "2026-11-01T00:00:00Z" }),
          summary({ id: 2, created_at: "2026-11-05T00:00:00Z" }),
          summary({ id: 3, is_member: false }),
          summary({ id: 4, circuit_status: "ARCHIVED" })
        ]
      }
    ]);
    expect(previews.map((p) => p.id)).toEqual([2, 1]);
    expect(previews[0]!.league_name).toBe("Film Club");
  });
});

describe("read-only values", () => {
  it("says states in words", () => {
    expect(onOffLabel(true)).toBe("On");
    expect(pickClockLabel(null)).toBe("Off");
    expect(pickClockLabel(0)).toBe("Off");
    expect(pickClockLabel(90)).toBe("90 seconds");
    expect(circuitLeagueEventValue({ enabled: false, weight: 2 })).toBe("Off");
    expect(circuitLeagueEventValue({ enabled: true, weight: 1.5 })).toBe(
      "On · weight 1.5"
    );
    expect(circuitLeagueCategoryValue({ weight: 2, max_owned: 3 })).toBe(
      "Weight 2 · limit 3"
    );
  });

  it("describes the viewer's membership before and after locking", () => {
    expect(circuitLeagueMembershipNote({ open: true, isMember: false })).toBe(
      "You’re not in this season yet."
    );
    expect(circuitLeagueMembershipNote({ open: false, isMember: false })).toBe(
      "Membership is locked."
    );
  });
});
