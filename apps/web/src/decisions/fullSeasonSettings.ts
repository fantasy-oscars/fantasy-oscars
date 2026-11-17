import { CIRCUIT_LEAGUE_LIMITS as LIMITS } from "@fantasy-oscars/shared/schemas";
import type { CircuitLeagueDetail, CircuitLeagueStatus } from "../lib/types";
import { DEFAULT_PICK_TIMER_SECONDS } from "./circuitLeague";

/*
 * A full awards season's settings, split into the four areas a commissioner
 * edits one at a time: events, scoring, roster and draft. Each area has a
 * draft (the modal's fields, as typed), defaults, validation and the values it
 * writes back. The create page applies drafts locally and sends the result
 * with the create request; the season page saves each area on its own.
 */

export type SettingsArea = "events" | "scoring" | "roster" | "draft";

export const SETTINGS_AREAS: readonly SettingsArea[] = [
  "events",
  "scoring",
  "roster",
  "draft"
];

export const SETTINGS_AREA_TITLES: Record<SettingsArea, string> = {
  events: "Events",
  scoring: "Scoring",
  roster: "Roster",
  draft: "Draft"
};

/** An event as the settings show it, in admin order. */
export type SettingsEvent = {
  id: number;
  name: string;
  is_group: boolean;
  ceremonies: Array<{ name: string }>;
};

/** A category as the settings show it, in admin order. */
export type SettingsCategory = { id: number; name: string };

/** Applied or saved values. A null pick timer is off; a null limit is none. */
export type FullSeasonSettings = {
  rosterSize: number;
  nominationPoints: number;
  winBonusPoints: number;
  pickTimerSeconds: number | null;
  autoDraftEnabled: boolean;
  events: Record<number, { enabled: boolean; weight: number }>;
  categories: Record<number, { weight: number; maxOwned: number | null }>;
};

/** The server's defaults for a new season (`CIRCUIT_LEAGUE_DEFAULTS`). */
export const FULL_SEASON_DEFAULTS = {
  rosterSize: 16,
  nominationPoints: 1,
  winBonusPoints: 2,
  pickTimerSeconds: DEFAULT_PICK_TIMER_SECONDS,
  autoDraftEnabled: true,
  weight: 1
} as const;

export function fullSeasonDefaults(
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): FullSeasonSettings {
  return {
    rosterSize: FULL_SEASON_DEFAULTS.rosterSize,
    nominationPoints: FULL_SEASON_DEFAULTS.nominationPoints,
    winBonusPoints: FULL_SEASON_DEFAULTS.winBonusPoints,
    pickTimerSeconds: FULL_SEASON_DEFAULTS.pickTimerSeconds,
    autoDraftEnabled: FULL_SEASON_DEFAULTS.autoDraftEnabled,
    events: Object.fromEntries(
      events.map((e) => [e.id, { enabled: true, weight: FULL_SEASON_DEFAULTS.weight }])
    ),
    categories: Object.fromEntries(
      categories.map((c) => [
        c.id,
        { weight: FULL_SEASON_DEFAULTS.weight, maxOwned: null }
      ])
    )
  };
}

export function fullSeasonSettingsFrom(detail: CircuitLeagueDetail): FullSeasonSettings {
  const s = detail.circuit_league;
  return {
    rosterSize: s.roster_size,
    nominationPoints: s.nomination_points,
    winBonusPoints: s.win_bonus_points,
    pickTimerSeconds:
      s.pick_timer_seconds && s.pick_timer_seconds > 0 ? s.pick_timer_seconds : null,
    autoDraftEnabled: s.auto_draft_enabled,
    events: Object.fromEntries(
      detail.events.map((e) => [e.id, { enabled: e.enabled, weight: e.weight }])
    ),
    categories: Object.fromEntries(
      detail.categories.map((c) => [c.id, { weight: c.weight, maxOwned: c.max_owned }])
    )
  };
}

/**
 * Keeps roster size, points and draft settings, and puts events and categories
 * back to their defaults: what changing the awards season on the create page
 * does.
 */
export function withDefaultEventsAndCategories(
  settings: FullSeasonSettings,
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): FullSeasonSettings {
  const defaults = fullSeasonDefaults(events, categories);
  return { ...settings, events: defaults.events, categories: defaults.categories };
}

export function hasCustomEventsOrCategories(settings: FullSeasonSettings): boolean {
  return (
    Object.values(settings.events).some(
      (e) => !e.enabled || e.weight !== FULL_SEASON_DEFAULTS.weight
    ) ||
    Object.values(settings.categories).some(
      (c) => c.weight !== FULL_SEASON_DEFAULTS.weight || c.maxOwned !== null
    )
  );
}

// ---------------------------------------------------------------------------
// Who may edit which area
// ---------------------------------------------------------------------------

export type AreaMode = "edit" | "view";

/**
 * Owner question 11 per area: everything in setup; only the draft once the
 * season is locked; nothing after the draft starts. Players only view.
 */
export function fullSeasonAreaModes(input: {
  status: CircuitLeagueStatus | string;
  canManage: boolean;
}): Record<SettingsArea, AreaMode> {
  const setup = input.canManage && input.status === "SETUP";
  const draft =
    input.canManage && (input.status === "SETUP" || input.status === "INITIALIZED");
  return {
    events: setup ? "edit" : "view",
    scoring: setup ? "edit" : "view",
    roster: setup ? "edit" : "view",
    draft: draft ? "edit" : "view"
  };
}

/** The helper under the settings heading on the season page; commissioners only. */
export function fullSeasonSettingsHelper(input: {
  status: CircuitLeagueStatus | string;
  canManage: boolean;
}): string | null {
  if (!input.canManage) return null;
  if (input.status === "SETUP") return "You can change these until you lock the season.";
  if (input.status === "INITIALIZED") {
    return "The season is locked, so events, scoring and the roster are fixed. Draft settings can change until the draft starts.";
  }
  return "Settings are fixed now that the draft has started.";
}

// ---------------------------------------------------------------------------
// Drafts: a modal's fields, as typed
// ---------------------------------------------------------------------------

/** A number input's value: a number, or the text typed so far ("" when empty). */
export type NumberField = number | string;

export type EventsDraft = {
  events: Record<number, { enabled: boolean; weight: NumberField }>;
};
export type ScoringDraft = {
  nominationPoints: NumberField;
  winBonusPoints: NumberField;
  weights: Record<number, NumberField>;
};
export type RosterDraft = {
  rosterSize: NumberField;
  /** "" is no limit. */
  limits: Record<number, NumberField>;
};
export type DraftDraft = {
  timerEnabled: boolean;
  pickTimerSeconds: NumberField;
  autoDraftEnabled: boolean;
};

export type AreaDrafts = {
  events: EventsDraft;
  scoring: ScoringDraft;
  roster: RosterDraft;
  draft: DraftDraft;
};

export type AreaDraft = AreaDrafts[SettingsArea];

/** An area's fields, filled from applied or saved settings. */
export function areaDraftFrom<A extends SettingsArea>(
  area: A,
  settings: FullSeasonSettings
): AreaDrafts[A] {
  return draftFrom(area, settings) as AreaDrafts[A];
}

function draftFrom(area: SettingsArea, s: FullSeasonSettings): AreaDraft {
  switch (area) {
    case "events":
      return {
        events: Object.fromEntries(
          Object.entries(s.events).map(([id, e]) => [id, { ...e }])
        )
      };
    case "scoring":
      return {
        nominationPoints: s.nominationPoints,
        winBonusPoints: s.winBonusPoints,
        weights: Object.fromEntries(
          Object.entries(s.categories).map(([id, c]) => [id, c.weight])
        )
      };
    case "roster":
      return {
        rosterSize: s.rosterSize,
        limits: Object.fromEntries(
          Object.entries(s.categories).map(([id, c]) => [id, c.maxOwned ?? ""])
        )
      };
    case "draft":
      return {
        timerEnabled: s.pickTimerSeconds !== null,
        pickTimerSeconds: s.pickTimerSeconds ?? DEFAULT_PICK_TIMER_SECONDS,
        autoDraftEnabled: s.autoDraftEnabled
      };
  }
}

/** The area's fields at their defaults. */
export function areaDraftDefaults<A extends SettingsArea>(
  area: A,
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): AreaDrafts[A] {
  return areaDraftFrom(area, fullSeasonDefaults(events, categories));
}

function normalizeNumber(field: NumberField): number | string {
  if (typeof field === "number") return field;
  const text = field.trim();
  if (text === "") return "";
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

function normalizeDraft(draft: AreaDraft): unknown {
  return JSON.parse(
    JSON.stringify(draft, (_key, value: unknown) =>
      typeof value === "number" || typeof value === "string"
        ? normalizeNumber(value)
        : value
    )
  );
}

/** Whether a draft differs from another (numbers compared by value). */
export function areaDraftChanged(a: AreaDraft, b: AreaDraft): boolean {
  return JSON.stringify(normalizeDraft(a)) !== JSON.stringify(normalizeDraft(b));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Field keys: "nominationPoints", "event:12", "weight:20", "limit:20", ... */
export type FieldError = { key: string; message: string };

export const SETTINGS_MESSAGES = {
  weight: `Enter a weight above 0, up to ${LIMITS.weight.max}.`,
  nominationPoints: `Nomination points must be between ${LIMITS.points.min} and ${LIMITS.points.max}`,
  winBonusPoints: `Win points must be between ${LIMITS.points.min} and ${LIMITS.points.max}`,
  rosterSize: `Roster size must be between ${LIMITS.rosterSize.min} and ${LIMITS.rosterSize.max}`,
  limit: `Enter a whole number from ${LIMITS.maxOwned.min} to ${LIMITS.maxOwned.max}, or leave it empty.`,
  pickTimerSeconds: "Enter a whole number of seconds from 1 to 86,400."
} as const;

function numberOf(field: NumberField): number | null {
  const n = normalizeNumber(field);
  return typeof n === "number" ? n : null;
}

function validWeight(field: NumberField): boolean {
  const n = numberOf(field);
  return n !== null && n > 0 && n <= LIMITS.weight.max;
}

function validWhole(field: NumberField, min: number, max: number): boolean {
  const n = numberOf(field);
  return n !== null && Number.isInteger(n) && n >= min && n <= max;
}

/** One field's message, or null when it is valid. Used on blur. */
export function validateField(
  key: string,
  value: NumberField,
  context: { timerEnabled?: boolean; eventEnabled?: boolean } = {}
): string | null {
  const [kind] = key.split(":");
  switch (kind) {
    case "event":
      if (context.eventEnabled === false) return null;
      return validWeight(value) ? null : SETTINGS_MESSAGES.weight;
    case "weight":
      return validWeight(value) ? null : SETTINGS_MESSAGES.weight;
    case "nominationPoints":
      return validWhole(value, LIMITS.points.min, LIMITS.points.max)
        ? null
        : SETTINGS_MESSAGES.nominationPoints;
    case "winBonusPoints":
      return validWhole(value, LIMITS.points.min, LIMITS.points.max)
        ? null
        : SETTINGS_MESSAGES.winBonusPoints;
    case "rosterSize":
      return validWhole(value, LIMITS.rosterSize.min, LIMITS.rosterSize.max)
        ? null
        : SETTINGS_MESSAGES.rosterSize;
    case "limit":
      return normalizeNumber(value) === "" ||
        validWhole(value, LIMITS.maxOwned.min, LIMITS.maxOwned.max)
        ? null
        : SETTINGS_MESSAGES.limit;
    case "pickTimerSeconds":
      if (context.timerEnabled === false) return null;
      return validWhole(value, 1, LIMITS.pickTimerSeconds.max)
        ? null
        : SETTINGS_MESSAGES.pickTimerSeconds;
    default:
      return null;
  }
}

/**
 * Every invalid field of a draft, in the modal's tab order, so the first one
 * is where focus goes. An event that is off keeps its weight unchecked.
 */
export function validateAreaDraft(
  area: SettingsArea,
  draft: AreaDraft,
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): FieldError[] {
  const errors: FieldError[] = [];
  const check = (
    key: string,
    value: NumberField,
    context?: Parameters<typeof validateField>[2]
  ) => {
    const message = validateField(key, value, context);
    if (message) errors.push({ key, message });
  };
  switch (area) {
    case "events": {
      const d = draft as EventsDraft;
      for (const e of events) {
        const f = d.events[e.id];
        if (f) check(`event:${e.id}`, f.weight, { eventEnabled: f.enabled });
      }
      break;
    }
    case "scoring": {
      const d = draft as ScoringDraft;
      check("nominationPoints", d.nominationPoints);
      check("winBonusPoints", d.winBonusPoints);
      for (const c of categories) {
        const w = d.weights[c.id];
        if (w !== undefined) check(`weight:${c.id}`, w);
      }
      break;
    }
    case "roster": {
      const d = draft as RosterDraft;
      check("rosterSize", d.rosterSize);
      for (const c of categories) {
        const l = d.limits[c.id];
        if (l !== undefined) check(`limit:${c.id}`, l);
      }
      break;
    }
    case "draft": {
      const d = draft as DraftDraft;
      check("pickTimerSeconds", d.pickTimerSeconds, { timerEnabled: d.timerEnabled });
      break;
    }
  }
  return errors;
}

/** Puts a valid draft's values into the settings; other areas are untouched. */
export function applyAreaDraft(
  area: SettingsArea,
  settings: FullSeasonSettings,
  draft: AreaDraft
): FullSeasonSettings {
  switch (area) {
    case "events": {
      const d = draft as EventsDraft;
      return {
        ...settings,
        events: Object.fromEntries(
          Object.entries(settings.events).map(([id, e]) => {
            const f = d.events[Number(id)];
            return [
              id,
              f
                ? {
                    enabled: f.enabled,
                    // An event that is off keeps its saved weight.
                    weight: f.enabled ? Number(numberOf(f.weight)) : e.weight
                  }
                : e
            ];
          })
        )
      };
    }
    case "scoring": {
      const d = draft as ScoringDraft;
      return {
        ...settings,
        nominationPoints: Number(numberOf(d.nominationPoints)),
        winBonusPoints: Number(numberOf(d.winBonusPoints)),
        categories: Object.fromEntries(
          Object.entries(settings.categories).map(([id, c]) => {
            const w = d.weights[Number(id)];
            return [id, w === undefined ? c : { ...c, weight: Number(numberOf(w)) }];
          })
        )
      };
    }
    case "roster": {
      const d = draft as RosterDraft;
      return {
        ...settings,
        rosterSize: Number(numberOf(d.rosterSize)),
        categories: Object.fromEntries(
          Object.entries(settings.categories).map(([id, c]) => {
            const l = d.limits[Number(id)];
            return [id, l === undefined ? c : { ...c, maxOwned: numberOf(l) }];
          })
        )
      };
    }
    case "draft": {
      const d = draft as DraftDraft;
      return {
        ...settings,
        pickTimerSeconds: d.timerEnabled ? Number(numberOf(d.pickTimerSeconds)) : null,
        autoDraftEnabled: d.autoDraftEnabled
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Warnings (never block)
// ---------------------------------------------------------------------------

/** The most contenders the limits allow, or null when any category is unlimited. */
export function limitsCapacity(limits: ReadonlyArray<number | null>): number | null {
  if (limits.length === 0 || limits.some((l) => l === null)) return null;
  return (limits as number[]).reduce((sum, l) => sum + l, 0);
}

/** The Roster modal's warning when the limits cannot fill a roster. */
export function rosterDraftShortfall(
  draft: RosterDraft,
  categories: readonly SettingsCategory[]
): { sum: number; size: number } | null {
  const size = numberOf(draft.rosterSize);
  const limits = categories.map((c) => {
    const l = draft.limits[c.id];
    return l === undefined ? null : numberOf(l);
  });
  const sum = limitsCapacity(limits);
  if (size === null || sum === null || sum >= size) return null;
  return { sum, size };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type FullSeasonWrites = {
  settings: {
    roster_size?: number;
    nomination_points?: number;
    win_bonus_points?: number;
    pick_timer_seconds?: number | null;
    auto_draft_enabled?: boolean;
  } | null;
  /** The full enabled set, in event order, when any event changed. */
  events: Array<{ circuit_event_id: number; weight: number }> | null;
  /** Only the categories that changed, each with both of its values. */
  categories: Array<{
    circuit_category_id: number;
    weight: number;
    max_owned: number | null;
  }> | null;
};

/**
 * The writes that turn `base` into `next`. On the season page `base` is the
 * saved detail and `next` differs in one area, so a category write always
 * carries the other column's saved value. On the create page `base` is the
 * defaults, so creating with the defaults sends no settings at all.
 */
export function fullSeasonWrites(
  base: FullSeasonSettings,
  next: FullSeasonSettings,
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): FullSeasonWrites {
  const settings: NonNullable<FullSeasonWrites["settings"]> = {};
  if (next.rosterSize !== base.rosterSize) settings.roster_size = next.rosterSize;
  if (next.nominationPoints !== base.nominationPoints) {
    settings.nomination_points = next.nominationPoints;
  }
  if (next.winBonusPoints !== base.winBonusPoints) {
    settings.win_bonus_points = next.winBonusPoints;
  }
  if (next.pickTimerSeconds !== base.pickTimerSeconds) {
    settings.pick_timer_seconds = next.pickTimerSeconds;
  }
  if (next.autoDraftEnabled !== base.autoDraftEnabled) {
    settings.auto_draft_enabled = next.autoDraftEnabled;
  }

  const eventsChanged = events.some((e) => {
    const a = base.events[e.id];
    const b = next.events[e.id];
    if (!a || !b) return false;
    return a.enabled !== b.enabled || (b.enabled && a.weight !== b.weight);
  });
  const eventWrites = eventsChanged
    ? events
        .filter((e) => next.events[e.id]?.enabled)
        .map((e) => ({ circuit_event_id: e.id, weight: next.events[e.id]!.weight }))
    : null;

  const categoryWrites = categories
    .filter((c) => {
      const a = base.categories[c.id];
      const b = next.categories[c.id];
      return a && b && (a.weight !== b.weight || a.maxOwned !== b.maxOwned);
    })
    .map((c) => ({
      circuit_category_id: c.id,
      weight: next.categories[c.id]!.weight,
      max_owned: next.categories[c.id]!.maxOwned
    }));

  return {
    settings: Object.keys(settings).length ? settings : null,
    events: eventWrites,
    categories: categoryWrites.length ? categoryWrites : null
  };
}
