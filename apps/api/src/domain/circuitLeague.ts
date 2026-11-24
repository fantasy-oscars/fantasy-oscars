import { AppError, validationError } from "../errors.js";
import { instantOfDay, resultsDateOf } from "./circuit.js";

/*
 * Circuit leagues (ADR 0005, section 4, under the ADR 0006 names). Pure: no IO.
 *
 * A league runs a Circuit competition beside its Seasons. Membership and
 * enabled events freeze at initialisation, and every path that adds or removes
 * a member or changes enabled events calls assertCircuitLeagueOpen, so a new
 * route cannot skip the check (audit 1.3).
 *
 * Settings after initialisation follow owner question 11 (recommended answer):
 * roster size, category limits, points and weights freeze with membership; the
 * pick clock and the auto-draft switch stay editable until the draft starts.
 */

export const circuitLeagueStatuses = [
  "SETUP",
  "INITIALIZED",
  "DRAFTING",
  "IN_SEASON",
  "COMPLETE"
] as const;
export type CircuitLeagueStatus = (typeof circuitLeagueStatuses)[number];

/** The column defaults of migration 027, for responses and tests. */
export const CIRCUIT_LEAGUE_DEFAULTS = {
  roster_size: 16,
  draft_type: "SNAKE",
  pick_timer_seconds: 90,
  auto_draft_enabled: true,
  nomination_points: 1,
  win_bonus_points: 2,
  event_weight: 1,
  category_weight: 1,
  max_owned: null
} as const;

export type CircuitLeagueState = {
  status: string;
  initialized_at: Date | string | null;
};

export function isCircuitLeagueOpen(league: CircuitLeagueState): boolean {
  return league.status === "SETUP" && league.initialized_at === null;
}

/**
 * The one guard for membership and enabled events: they change only while the
 * league is in SETUP. Every member and event write path calls it.
 */
export function assertCircuitLeagueOpen(league: CircuitLeagueState): void {
  if (!isCircuitLeagueOpen(league)) {
    throw new AppError(
      "CIRCUIT_LEAGUE_LOCKED",
      409,
      "This season has started, so its players and events are fixed",
      { status: league.status }
    );
  }
}

/** Settings that stay editable after initialisation, until the draft starts. */
export const CIRCUIT_LEAGUE_DRAFT_SETTINGS = [
  "pick_timer_seconds",
  "auto_draft_enabled"
] as const;

export type CircuitLeagueSettingKey =
  | "roster_size"
  | "pick_timer_seconds"
  | "auto_draft_enabled"
  | "nomination_points"
  | "win_bonus_points"
  | "category_settings";

/**
 * Refuses a settings edit the league's status no longer allows: everything is
 * editable in SETUP, only the draft settings in INITIALIZED, nothing later.
 */
export function assertCircuitLeagueSettingsEditable(
  league: CircuitLeagueState,
  keys: readonly CircuitLeagueSettingKey[]
): void {
  if (isCircuitLeagueOpen(league)) return;
  const draftOnly = keys.every((key) =>
    (CIRCUIT_LEAGUE_DRAFT_SETTINGS as readonly string[]).includes(key)
  );
  if (league.status === "INITIALIZED" && draftOnly) return;
  throw new AppError(
    "CIRCUIT_LEAGUE_SETTINGS_LOCKED",
    409,
    league.status === "INITIALIZED"
      ? "Only the pick clock and auto-draft can change once the season has started"
      : "Settings can't change once the draft has started",
    { status: league.status }
  );
}

/**
 * Checks that every id in `ids` belongs to the Circuit (`known`). The request
 * schemas already reject duplicates.
 */
export function assertIdsInCircuit(
  ids: readonly number[],
  known: readonly number[],
  message: string,
  field: string
): void {
  const allowed = new Set(known);
  if (!ids.every((id) => allowed.has(id))) throw validationError(message, [field]);
}

/** A live ceremony of the league's Circuit, with what the completion rule reads. */
export type CircuitLeagueCeremonyProgress = {
  circuit_event_id: number;
  results_finalized_at: Date | string | null;
  nominations_on: string | null;
  starts_at: Date | string | null;
};

/** True once the occasion's day has begun, which is when its rows can score. */
function hasDayBegun(day: string | null, now: Date): boolean {
  return day !== null && instantOfDay(day).getTime() <= now.getTime();
}

/**
 * The status of a season in play, once scoring has caught up: COMPLETE when
 * every ceremony of an enabled event has finalised winners and both its
 * occasions (nominations and win) have begun and so have scored, otherwise
 * IN_SEASON. Ceremonies of events the league has not enabled are ignored, and
 * a league with no ceremony to wait for is not complete. A league outside
 * IN_SEASON and COMPLETE keeps its status. Pure and idempotent: the same
 * stored history always gives the same answer, so a score rebuild can call it
 * freely, and a later unfinished ceremony moves a COMPLETE league back.
 */
export function circuitLeagueStatusAfterScoring(
  status: string,
  enabledEventIds: readonly number[],
  ceremonies: readonly CircuitLeagueCeremonyProgress[],
  now: Date
): string {
  if (status !== "IN_SEASON" && status !== "COMPLETE") return status;
  const enabled = new Set(enabledEventIds);
  const counted = ceremonies.filter((c) => enabled.has(c.circuit_event_id));
  const finished =
    counted.length > 0 &&
    counted.every(
      (c) =>
        c.results_finalized_at !== null &&
        hasDayBegun(c.nominations_on, now) &&
        hasDayBegun(resultsDateOf(c.starts_at), now)
    );
  return finished ? "COMPLETE" : "IN_SEASON";
}
