import { describe, expect, it } from "vitest";
import {
  SETTINGS_MESSAGES,
  applyAreaDraft,
  areaDraftChanged,
  areaDraftDefaults,
  areaDraftFrom,
  fullSeasonAreaModes,
  fullSeasonDefaults,
  fullSeasonSettingsFrom,
  fullSeasonSettingsHelper,
  fullSeasonWrites,
  hasCustomEventsOrCategories,
  limitsCapacity,
  rosterDraftShortfall,
  validateAreaDraft,
  withDefaultEventsAndCategories,
  type SettingsCategory,
  type SettingsEvent
} from "@/decisions/fullSeasonSettings";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";

const EVENTS: SettingsEvent[] = [
  { id: 10, name: "Golden Reel", is_group: false, ceremonies: [] },
  { id: 11, name: "Guild Awards", is_group: true, ceremonies: [{ name: "DGA" }] }
];
const CATEGORIES: SettingsCategory[] = [
  { id: 20, name: "Best Picture" },
  { id: 21, name: "Best Actress" }
];

describe("full season settings", () => {
  it("reads the saved detail, an untimed clock as off", () => {
    const detail = circuitLeagueDetail();
    detail.circuit_league.pick_timer_seconds = 0;
    detail.categories[0]!.max_owned = 2;
    const s = fullSeasonSettingsFrom(detail);
    expect(s).toMatchObject({
      rosterSize: 16,
      nominationPoints: 1,
      winBonusPoints: 2,
      pickTimerSeconds: null,
      autoDraftEnabled: true
    });
    expect(s.events[11]).toEqual({ enabled: true, weight: 1 });
    expect(s.categories[20]).toEqual({ weight: 1, maxOwned: 2 });
  });

  it("matches the server defaults", () => {
    const s = fullSeasonDefaults(EVENTS, CATEGORIES);
    expect(s).toMatchObject({
      rosterSize: 16,
      nominationPoints: 1,
      winBonusPoints: 2,
      pickTimerSeconds: 90,
      autoDraftEnabled: true
    });
    expect(Object.values(s.events)).toEqual([
      { enabled: true, weight: 1 },
      { enabled: true, weight: 1 }
    ]);
    expect(hasCustomEventsOrCategories(s)).toBe(false);
  });

  it("changing the awards season resets events and categories only", () => {
    const s = fullSeasonDefaults(EVENTS, CATEGORIES);
    s.rosterSize = 10;
    s.events[10]!.weight = 2;
    expect(hasCustomEventsOrCategories(s)).toBe(true);
    const next = withDefaultEventsAndCategories(s, [], [{ id: 30, name: "Best Song" }]);
    expect(next.rosterSize).toBe(10);
    expect(next.events).toEqual({});
    expect(next.categories).toEqual({ 30: { weight: 1, maxOwned: null } });
  });
});

describe("who edits which area", () => {
  it("follows owner question 11 per area, and players only view", () => {
    expect(fullSeasonAreaModes({ status: "SETUP", canManage: true })).toEqual({
      events: "edit",
      scoring: "edit",
      roster: "edit",
      draft: "edit"
    });
    expect(fullSeasonAreaModes({ status: "INITIALIZED", canManage: true })).toEqual({
      events: "view",
      scoring: "view",
      roster: "view",
      draft: "edit"
    });
    expect(
      Object.values(fullSeasonAreaModes({ status: "DRAFTING", canManage: true }))
    ).toEqual(["view", "view", "view", "view"]);
    expect(
      Object.values(fullSeasonAreaModes({ status: "SETUP", canManage: false }))
    ).toEqual(["view", "view", "view", "view"]);
  });

  it("explains what is fixed, to commissioners only", () => {
    expect(fullSeasonSettingsHelper({ status: "SETUP", canManage: true })).toBe(
      "You can change these until you lock the season."
    );
    expect(fullSeasonSettingsHelper({ status: "INITIALIZED", canManage: true })).toMatch(
      /^The season is locked/
    );
    expect(fullSeasonSettingsHelper({ status: "COMPLETE", canManage: true })).toBe(
      "Settings are fixed now that the draft has started."
    );
    expect(fullSeasonSettingsHelper({ status: "SETUP", canManage: false })).toBeNull();
  });
});

describe("area drafts", () => {
  const settings = fullSeasonDefaults(EVENTS, CATEGORIES);

  it("fills each area's fields and keeps the timer value when it is off", () => {
    expect(areaDraftFrom("roster", settings)).toEqual({
      rosterSize: 16,
      limits: { 20: "", 21: "" }
    });
    expect(areaDraftFrom("draft", { ...settings, pickTimerSeconds: null })).toEqual({
      timerEnabled: false,
      pickTimerSeconds: 90,
      autoDraftEnabled: true
    });
  });

  it("compares numbers by value, so typed text equal to the saved value is unchanged", () => {
    const a = areaDraftFrom("scoring", settings);
    expect(areaDraftChanged(a, { ...a, nominationPoints: "1" })).toBe(false);
    expect(areaDraftChanged(a, { ...a, nominationPoints: "2" })).toBe(true);
  });

  it("restores an area's defaults", () => {
    expect(areaDraftDefaults("events", EVENTS, CATEGORIES)).toEqual({
      events: { 10: { enabled: true, weight: 1 }, 11: { enabled: true, weight: 1 } }
    });
  });

  it("validates in tab order with the prescribed messages", () => {
    expect(
      validateAreaDraft(
        "scoring",
        { nominationPoints: "", winBonusPoints: 101, weights: { 20: 0, 21: "1.5" } },
        EVENTS,
        CATEGORIES
      )
    ).toEqual([
      { key: "nominationPoints", message: SETTINGS_MESSAGES.nominationPoints },
      { key: "winBonusPoints", message: SETTINGS_MESSAGES.winBonusPoints },
      { key: "weight:20", message: "Enter a weight above 0, up to 100." }
    ]);
    expect(
      validateAreaDraft(
        "roster",
        { rosterSize: 65, limits: { 20: 0, 21: "" } },
        EVENTS,
        CATEGORIES
      )
    ).toEqual([
      { key: "rosterSize", message: "Roster size must be between 1 and 64" },
      {
        key: "limit:20",
        message: "Enter a whole number from 1 to 64, or leave it empty."
      }
    ]);
    expect(
      validateAreaDraft(
        "draft",
        { timerEnabled: true, pickTimerSeconds: 1.5, autoDraftEnabled: true },
        EVENTS,
        CATEGORIES
      )
    ).toEqual([
      {
        key: "pickTimerSeconds",
        message: "Enter a whole number of seconds from 1 to 86,400."
      }
    ]);
  });

  it("skips the weight of an event that is off and the seconds of a timer that is off", () => {
    expect(
      validateAreaDraft(
        "events",
        {
          events: { 10: { enabled: false, weight: 0 }, 11: { enabled: true, weight: 1 } }
        },
        EVENTS,
        CATEGORIES
      )
    ).toEqual([]);
    expect(
      validateAreaDraft(
        "draft",
        { timerEnabled: false, pickTimerSeconds: "", autoDraftEnabled: true },
        EVENTS,
        CATEGORIES
      )
    ).toEqual([]);
  });

  it("applies an area without touching the others", () => {
    const next = applyAreaDraft("roster", settings, {
      rosterSize: "12",
      limits: { 20: "2", 21: "" }
    });
    expect(next.rosterSize).toBe(12);
    expect(next.categories).toEqual({
      20: { weight: 1, maxOwned: 2 },
      21: { weight: 1, maxOwned: null }
    });
    expect(next.nominationPoints).toBe(1);
    const off = applyAreaDraft("draft", settings, {
      timerEnabled: false,
      pickTimerSeconds: 90,
      autoDraftEnabled: false
    });
    expect(off).toMatchObject({ pickTimerSeconds: null, autoDraftEnabled: false });
    const events = applyAreaDraft("events", settings, {
      events: { 10: { enabled: false, weight: 5 }, 11: { enabled: true, weight: "2.5" } }
    });
    expect(events.events).toEqual({
      10: { enabled: false, weight: 1 },
      11: { enabled: true, weight: 2.5 }
    });
  });

  it("warns when every category is limited below the roster size", () => {
    expect(limitsCapacity([2, 3])).toBe(5);
    expect(limitsCapacity([2, null])).toBeNull();
    expect(limitsCapacity([])).toBeNull();
    expect(
      rosterDraftShortfall({ rosterSize: 16, limits: { 20: 6, 21: "6" } }, CATEGORIES)
    ).toEqual({ sum: 12, size: 16 });
    expect(
      rosterDraftShortfall({ rosterSize: 16, limits: { 20: 6, 21: "" } }, CATEGORIES)
    ).toBeNull();
  });
});

describe("writes", () => {
  const base = fullSeasonDefaults(EVENTS, CATEGORIES);

  it("sends nothing for the defaults", () => {
    expect(fullSeasonWrites(base, base, EVENTS, CATEGORIES)).toEqual({
      settings: null,
      events: null,
      categories: null
    });
  });

  it("sends changed settings, the full enabled set, and changed categories with both values", () => {
    const next = structuredClone(base);
    next.rosterSize = 12;
    next.pickTimerSeconds = null;
    next.events[11] = { enabled: false, weight: 1 };
    next.categories[21] = { weight: 1, maxOwned: 3 };
    expect(fullSeasonWrites(base, next, EVENTS, CATEGORIES)).toEqual({
      settings: { roster_size: 12, pick_timer_seconds: null },
      events: [{ circuit_event_id: 10, weight: 1 }],
      categories: [{ circuit_category_id: 21, weight: 1, max_owned: 3 }]
    });
  });

  it("sends an empty enabled set when every event is off", () => {
    const next = structuredClone(base);
    next.events[10]!.enabled = false;
    next.events[11]!.enabled = false;
    expect(fullSeasonWrites(base, next, EVENTS, CATEGORIES).events).toEqual([]);
  });
});
