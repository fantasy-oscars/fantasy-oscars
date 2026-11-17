import { describe, expect, it } from "vitest";
import {
  CIRCUIT_LEAGUE_DEFAULTS,
  assertCircuitLeagueOpen,
  assertCircuitLeagueSettingsEditable,
  assertIdsInCircuit,
  isCircuitLeagueOpen
} from "../../../src/domain/circuitLeague.js";

const setup = { status: "SETUP", initialized_at: null };
const initialized = { status: "INITIALIZED", initialized_at: new Date() };
const drafting = { status: "DRAFTING", initialized_at: new Date() };

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

describe("circuit league domain", () => {
  it("defaults to roster 16, 1 + 2 points, weights 1, no limits, a 90-second clock and snake", () => {
    expect(CIRCUIT_LEAGUE_DEFAULTS).toEqual({
      roster_size: 16,
      draft_type: "SNAKE",
      pick_timer_seconds: 90,
      auto_draft_enabled: true,
      nomination_points: 1,
      win_bonus_points: 2,
      event_weight: 1,
      category_weight: 1,
      max_owned: null
    });
  });

  it("is open only in SETUP and before initialisation", () => {
    expect(isCircuitLeagueOpen(setup)).toBe(true);
    expect(isCircuitLeagueOpen(initialized)).toBe(false);
    expect(isCircuitLeagueOpen(drafting)).toBe(false);
    expect(isCircuitLeagueOpen({ status: "SETUP", initialized_at: new Date() })).toBe(
      false
    );
  });

  it("guards membership and events with one 409", () => {
    expect(codeOf(() => assertCircuitLeagueOpen(setup))).toBeNull();
    for (const league of [initialized, drafting, { ...drafting, status: "COMPLETE" }]) {
      expect(codeOf(() => assertCircuitLeagueOpen(league))).toBe("CIRCUIT_LEAGUE_LOCKED");
    }
  });

  it("allows every setting in SETUP", () => {
    expect(
      codeOf(() =>
        assertCircuitLeagueSettingsEditable(setup, [
          "roster_size",
          "nomination_points",
          "win_bonus_points",
          "category_settings",
          "pick_timer_seconds",
          "auto_draft_enabled"
        ])
      )
    ).toBeNull();
  });

  it("allows only the clock and auto-draft once initialised, and nothing once drafting", () => {
    expect(
      codeOf(() =>
        assertCircuitLeagueSettingsEditable(initialized, [
          "pick_timer_seconds",
          "auto_draft_enabled"
        ])
      )
    ).toBeNull();
    for (const key of [
      "roster_size",
      "nomination_points",
      "win_bonus_points",
      "category_settings"
    ] as const) {
      expect(
        codeOf(() =>
          assertCircuitLeagueSettingsEditable(initialized, ["pick_timer_seconds", key])
        )
      ).toBe("CIRCUIT_LEAGUE_SETTINGS_LOCKED");
    }
    expect(
      codeOf(() => assertCircuitLeagueSettingsEditable(drafting, ["pick_timer_seconds"]))
    ).toBe("CIRCUIT_LEAGUE_SETTINGS_LOCKED");
  });

  it("accepts ids of the Circuit, including none, and rejects others", () => {
    expect(codeOf(() => assertIdsInCircuit([], [1, 2], "m", "events"))).toBeNull();
    expect(codeOf(() => assertIdsInCircuit([2], [1, 2], "m", "events"))).toBeNull();
    expect(codeOf(() => assertIdsInCircuit([3], [1, 2], "m", "events"))).toBe(
      "VALIDATION_ERROR"
    );
  });
});
