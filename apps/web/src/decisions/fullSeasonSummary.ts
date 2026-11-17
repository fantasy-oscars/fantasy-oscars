import type {
  FullSeasonSettings,
  SettingsArea,
  SettingsCategory,
  SettingsEvent
} from "./fullSeasonSettings";
import { limitsCapacity } from "./fullSeasonSettings";

/*
 * The one- or two-line summary of each settings area, shown beside its Edit or
 * View button. Summaries are capped in copy (a few names, then "and n more"),
 * never by CSS. Lists follow admin order.
 */

export type AreaSummary = {
  line1: string;
  line2: string | null;
  /** The area has nothing to edit (no events), so its button is disabled. */
  empty: boolean;
};

const EVENTS_SHOWN = 6;
const CATEGORIES_SHOWN = 3;

/** A weight after a multiplication sign, as typed: "×2", "×1.5", "×0.25". */
export function weightLabel(weight: number): string {
  return `×${weight}`;
}

/** "A, B, C", or "A, B, C and 4 more" past `max`. No Oxford comma. */
export function cappedList(items: readonly string[], max: number): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
}

/** The largest unit that divides the seconds exactly: days, hours, minutes, seconds. */
export function durationLabel(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds % 86400 === 0) return unit(seconds / 86400, "day");
  if (seconds % 3600 === 0) return unit(seconds / 3600, "hour");
  if (seconds >= 60 && seconds % 60 === 0) return unit(seconds / 60, "minute");
  return unit(seconds, "second");
}

export function eventsSummary(
  settings: FullSeasonSettings,
  events: readonly SettingsEvent[]
): AreaSummary {
  const n = events.length;
  if (n === 0) {
    return { line1: "This awards season has no events yet.", line2: null, empty: true };
  }
  const on = events.filter((e) => settings.events[e.id]?.enabled);
  const k = on.length;
  if (k === 0) {
    return {
      line1: "No events count, so nothing will score.",
      line2: null,
      empty: false
    };
  }
  const weightOf = (e: SettingsEvent) => settings.events[e.id]?.weight ?? 1;
  const w = on.filter((e) => weightOf(e) !== 1).length;
  const line2 = cappedList(
    on.map((e) => (weightOf(e) === 1 ? e.name : `${e.name} ${weightLabel(weightOf(e))}`)),
    EVENTS_SHOWN
  );
  let line1: string;
  if (n === 1) {
    line1 = "1 event counts.";
  } else {
    const count =
      k === n
        ? `All ${n} events count`
        : `${k} of ${n} events ${k === 1 ? "counts" : "count"}`;
    line1 = w === 0 ? `${count} equally.` : `${count}; ${w} weighted differently.`;
  }
  return { line1, line2, empty: false };
}

function pointsLabel(points: number): string {
  return points === 1 ? "1 point" : `${points} points`;
}

export function scoringSummary(
  settings: FullSeasonSettings,
  categories: readonly SettingsCategory[]
): AreaSummary {
  const nom = settings.nominationPoints;
  const win = settings.winBonusPoints;
  let line1: string;
  if (nom === 0 && win === 0) line1 = "No points for nominations or wins.";
  else if (nom === 0) line1 = `No points for nominations, ${win} per win.`;
  else if (win === 0) line1 = `${pointsLabel(nom)} per nomination, none for wins.`;
  else line1 = `${pointsLabel(nom)} per nomination, ${win} per win.`;

  let line2: string;
  if (categories.length === 0) {
    line2 = "This awards season has no categories yet.";
  } else {
    const weighted = categories.filter(
      (c) => (settings.categories[c.id]?.weight ?? 1) !== 1
    );
    line2 =
      weighted.length === 0
        ? "Every category counts equally."
        : `Weighted: ${cappedList(
            weighted.map(
              (c) => `${c.name} ${weightLabel(settings.categories[c.id]!.weight)}`
            ),
            CATEGORIES_SHOWN
          )}.`;
  }
  return { line1, line2, empty: false };
}

export function rosterSummary(
  settings: FullSeasonSettings,
  categories: readonly SettingsCategory[]
): AreaSummary {
  const size = settings.rosterSize;
  const line1 = `${size} ${size === 1 ? "contender" : "contenders"} per player.`;
  if (categories.length === 0) {
    return { line1, line2: "This awards season has no categories yet.", empty: false };
  }
  const limitOf = (c: SettingsCategory) => settings.categories[c.id]?.maxOwned ?? null;
  const limited = categories.filter((c) => limitOf(c) !== null);
  if (limited.length === 0) return { line1, line2: "No category limits.", empty: false };
  let line2 = `Limits: ${cappedList(
    limited.map((c) => `${c.name} ${limitOf(c)}`),
    CATEGORIES_SHOWN
  )}.`;
  const capacity = limitsCapacity(categories.map(limitOf));
  if (capacity !== null && capacity < size) line2 += ` Limits allow only ${capacity}.`;
  return { line1, line2, empty: false };
}

export function draftSummary(settings: FullSeasonSettings): AreaSummary {
  const line1 =
    settings.pickTimerSeconds === null
      ? "Snake draft, no pick timer."
      : `Snake draft, ${durationLabel(settings.pickTimerSeconds)} per pick.`;
  return {
    line1,
    line2: settings.autoDraftEnabled ? "Auto-draft on." : "Auto-draft off.",
    empty: false
  };
}

export function areaSummary(
  area: SettingsArea,
  settings: FullSeasonSettings,
  events: readonly SettingsEvent[],
  categories: readonly SettingsCategory[]
): AreaSummary {
  switch (area) {
    case "events":
      return eventsSummary(settings, events);
    case "scoring":
      return scoringSummary(settings, categories);
    case "roster":
      return rosterSummary(settings, categories);
    case "draft":
      return draftSummary(settings);
  }
}

/** The modal's section meta: "4 of 6 on". */
export function eventsOnMeta(on: number, total: number): string {
  return `${on} of ${total} on`;
}

/** The Scoring modal's section meta. */
export function weightedMeta(weighted: number): string {
  return weighted === 0 ? "Every category counts equally" : `${weighted} weighted`;
}

/** The Roster modal's section meta. */
export function limitedMeta(limited: number): string {
  return limited === 0 ? "No limits" : `${limited} limited`;
}

/** The status line after a modal applies (create) or saves (season page). */
export function areaStatusLine(area: SettingsArea, saved: boolean): string {
  const name = { events: "Events", scoring: "Scoring", roster: "Roster", draft: "Draft" }[
    area
  ];
  return `${name} ${saved ? "saved" : "updated"}.`;
}

/*
 * Read-only values, for viewers who cannot edit an area (players, and
 * commissioners once it is frozen).
 */

export function categoryWeightValue(weight: number): string {
  return `Weight ${weight}`;
}

export function categoryLimitValue(maxOwned: number | null): string {
  return maxOwned === null ? "No limit" : `Limit ${maxOwned}`;
}
