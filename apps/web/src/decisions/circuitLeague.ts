import type {
  CircuitLeagueDetail,
  CircuitLeagueStatus,
  CircuitLeagueSummary,
  CircuitSummary
} from "../lib/types";

/*
 * A league's competition in one Circuit. Players see it as a season, so every
 * label here says "season", never "Circuit".
 */

/** Pick clock the form offers when a timer is switched on. */
export const DEFAULT_PICK_TIMER_SECONDS = 90;

/** Status pill text; matches the labels `statusTone` already knows. */
export function circuitLeagueStatusLabel(status: CircuitLeagueStatus | string): string {
  switch (status) {
    case "SETUP":
      return "Open";
    case "INITIALIZED":
      return "Pre-draft";
    case "DRAFTING":
      return "Drafting";
    case "IN_SEASON":
      return "In progress";
    case "COMPLETE":
      return "Complete";
    default:
      return "Closed";
  }
}

export function circuitLeagueMemberCountLabel(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

/**
 * What a commissioner may still change (owner question 11): everything in
 * setup; only the pick clock and auto-draft once initialised; nothing after the
 * draft starts. Membership and events follow `all`.
 */
export function circuitLeagueEditable(status: CircuitLeagueStatus | string): {
  all: boolean;
  draftClock: boolean;
} {
  return {
    all: status === "SETUP",
    draftClock: status === "SETUP" || status === "INITIALIZED"
  };
}

/** A number input's value: a number, or the text typed so far ("" when empty). */
export type NumberField = number | string;

export type CircuitLeagueForm = {
  rosterSize: NumberField;
  nominationPoints: NumberField;
  winBonusPoints: NumberField;
  timerEnabled: boolean;
  pickTimerSeconds: NumberField;
  autoDraftEnabled: boolean;
  events: Record<number, { enabled: boolean; weight: NumberField }>;
  /** An empty `maxOwned` means no limit. */
  categories: Record<number, { weight: NumberField; maxOwned: NumberField }>;
};

export function circuitLeagueFormFrom(detail: CircuitLeagueDetail): CircuitLeagueForm {
  const s = detail.circuit_league;
  const timer = s.pick_timer_seconds ?? 0;
  return {
    rosterSize: s.roster_size,
    nominationPoints: s.nomination_points,
    winBonusPoints: s.win_bonus_points,
    timerEnabled: timer > 0,
    pickTimerSeconds: timer > 0 ? timer : DEFAULT_PICK_TIMER_SECONDS,
    autoDraftEnabled: s.auto_draft_enabled,
    events: Object.fromEntries(
      detail.events.map((e) => [e.id, { enabled: e.enabled, weight: e.weight }])
    ),
    categories: Object.fromEntries(
      detail.categories.map((c) => [
        c.id,
        { weight: c.weight, maxOwned: c.max_owned ?? "" }
      ])
    )
  };
}

function sameNumber(field: NumberField, value: number | null): boolean {
  if (value === null) return field === "";
  return field !== "" && Number(field) === value;
}

export type CircuitLeagueSettingsPatch = {
  roster_size?: NumberField;
  nomination_points?: NumberField;
  win_bonus_points?: NumberField;
  pick_timer_seconds?: NumberField | null;
  auto_draft_enabled?: boolean;
};

export type CircuitLeagueChanges = {
  settings: CircuitLeagueSettingsPatch | null;
  events: Array<{ circuit_event_id: number; weight: NumberField }> | null;
  categories: Array<{
    circuit_category_id: number;
    weight: NumberField;
    max_owned: NumberField | null;
  }> | null;
};

/**
 * The writes that turn the saved league into the form: a settings patch with
 * only the changed fields, the full list of enabled events (the API replaces
 * the set) when any event changed, and only the categories that changed. A
 * part that did not change is null. Values go to the API as typed, so its
 * validation messages reach the player.
 */
export function circuitLeagueChanges(
  detail: CircuitLeagueDetail,
  form: CircuitLeagueForm
): CircuitLeagueChanges {
  const s = detail.circuit_league;
  const settings: CircuitLeagueSettingsPatch = {};
  if (!sameNumber(form.rosterSize, s.roster_size)) settings.roster_size = form.rosterSize;
  if (!sameNumber(form.nominationPoints, s.nomination_points)) {
    settings.nomination_points = form.nominationPoints;
  }
  if (!sameNumber(form.winBonusPoints, s.win_bonus_points)) {
    settings.win_bonus_points = form.winBonusPoints;
  }
  const savedTimer = s.pick_timer_seconds ?? 0;
  if (form.timerEnabled) {
    if (!sameNumber(form.pickTimerSeconds, savedTimer)) {
      settings.pick_timer_seconds = form.pickTimerSeconds;
    }
  } else if (savedTimer > 0) {
    settings.pick_timer_seconds = null;
  }
  if (form.autoDraftEnabled !== s.auto_draft_enabled) {
    settings.auto_draft_enabled = form.autoDraftEnabled;
  }

  const eventsChanged = detail.events.some((e) => {
    const f = form.events[e.id];
    if (!f) return false;
    if (f.enabled !== e.enabled) return true;
    return f.enabled && !sameNumber(f.weight, e.weight);
  });
  const events = eventsChanged
    ? detail.events
        .filter((e) => form.events[e.id]?.enabled)
        .map((e) => ({ circuit_event_id: e.id, weight: form.events[e.id]!.weight }))
    : null;

  const categories = detail.categories
    .filter((c) => {
      const f = form.categories[c.id];
      return (
        f && (!sameNumber(f.weight, c.weight) || !sameNumber(f.maxOwned, c.max_owned))
      );
    })
    .map((c) => {
      const f = form.categories[c.id]!;
      return {
        circuit_category_id: c.id,
        weight: f.weight,
        max_owned: f.maxOwned === "" ? null : f.maxOwned
      };
    });

  return {
    settings: Object.keys(settings).length ? settings : null,
    events,
    categories: categories.length ? categories : null
  };
}

export function hasCircuitLeagueChanges(changes: CircuitLeagueChanges): boolean {
  return Boolean(changes.settings || changes.events || changes.categories);
}

/** The ceremonies a grouped event spans, for its checkbox description. */
export function circuitLeagueEventDescription(event: {
  is_group: boolean;
  ceremonies: Array<{ name: string }>;
}): string | null {
  if (!event.is_group) return null;
  if (event.ceremonies.length === 0) return "No ceremonies yet";
  return event.ceremonies.map((c) => c.name).join(", ");
}

/** Circuits a commissioner can still start in this league: public, not archived, not started. */
export function startableCircuits(
  circuits: CircuitSummary[],
  started: Array<Pick<CircuitLeagueSummary, "circuit_id">>
): CircuitSummary[] {
  const taken = new Set(started.map((c) => c.circuit_id));
  return circuits.filter((c) => c.status === "ACTIVE" && !taken.has(c.id));
}

/*
 * Read-only values, for viewers who cannot edit a section (players, and
 * commissioners once it is frozen). States are words, not greyed controls.
 */

export function onOffLabel(on: boolean): string {
  return on ? "On" : "Off";
}

export function pickClockLabel(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "Off";
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

export function circuitLeagueEventValue(event: {
  enabled: boolean;
  weight: number;
}): string {
  return event.enabled ? `On · weight ${event.weight}` : "Off";
}

export function circuitLeagueCategoryValue(category: {
  weight: number;
  max_owned: number | null;
}): string {
  const limit = category.max_owned === null ? "no limit" : `limit ${category.max_owned}`;
  return `Weight ${category.weight} · ${limit}`;
}

/** What the viewer's own membership looks like, for the bar under the header. */
export function circuitLeagueMembershipNote(input: {
  open: boolean;
  isMember: boolean;
}): string {
  if (input.open) {
    return input.isMember ? "You’re in this season." : "You’re not in this season yet.";
  }
  return input.isMember
    ? "You’re in this season. Membership is locked."
    : "Membership is locked.";
}
