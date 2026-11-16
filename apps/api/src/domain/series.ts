/*
 * Series domain (ADR 0005, sections 2 and 3). Pure: no IO.
 *
 * Event and category codes are fixed so the competition's universe cannot
 * drift; the migration's check constraints mirror these lists.
 */

export const SERIES_EVENTS = [
  { code: "CRITICS_CHOICE", name: "Critics Choice Awards" },
  { code: "GOLDEN_GLOBES", name: "Golden Globe Awards" },
  { code: "GUILDS", name: "Guild Awards" },
  { code: "BAFTA", name: "BAFTA Film Awards" },
  { code: "OSCARS", name: "Academy Awards" }
] as const;

export type SeriesEventCode = (typeof SERIES_EVENTS)[number]["code"];

export type SeriesCategoryKind = "FILM" | "ACTING";

export const SERIES_CATEGORIES = [
  { code: "PICTURE", name: "Best Picture", kind: "FILM" },
  { code: "DIRECTOR", name: "Best Director", kind: "FILM" },
  { code: "ACTOR", name: "Best Actor", kind: "ACTING" },
  { code: "ACTRESS", name: "Best Actress", kind: "ACTING" },
  { code: "SUPPORTING_ACTOR", name: "Best Supporting Actor", kind: "ACTING" },
  { code: "SUPPORTING_ACTRESS", name: "Best Supporting Actress", kind: "ACTING" },
  { code: "SCREENPLAY", name: "Best Screenplay", kind: "FILM" },
  { code: "ANIMATED_FEATURE", name: "Best Animated Feature", kind: "FILM" }
] as const satisfies ReadonlyArray<{
  code: string;
  name: string;
  kind: SeriesCategoryKind;
}>;

export type SeriesCategoryCode = (typeof SERIES_CATEGORIES)[number]["code"];

export const seriesStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type SeriesStatus = (typeof seriesStatuses)[number];

/** The rows a new Series starts with, in display order. */
export function initialSeriesEvents() {
  return SERIES_EVENTS.map((e, i) => ({ code: e.code, name: e.name, sort_index: i }));
}

export function initialSeriesCategories() {
  return SERIES_CATEGORIES.map((c, i) => ({
    code: c.code,
    name: c.name,
    kind: c.kind as SeriesCategoryKind,
    sort_index: i
  }));
}

export function seriesCategoryKind(code: string): SeriesCategoryKind | null {
  return SERIES_CATEGORIES.find((c) => c.code === code)?.kind ?? null;
}

/** An associated ceremony with the dates that drive its scoring occasions. */
export type SeriesCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  series_event_id: number;
  event_code: string;
  event_sort_index: number;
  /** Whole day, `YYYY-MM-DD`. */
  nominations_on: string | null;
  /** Whole day, `YYYY-MM-DD`. */
  results_on: string | null;
};

export type MissingCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  missing: Array<"nominations_on" | "results_on">;
};

function byEventThenCeremony(a: SeriesCeremonyDates, b: SeriesCeremonyDates) {
  return a.event_sort_index - b.event_sort_index || a.ceremony_id - b.ceremony_id;
}

/**
 * Soft readiness check for activation: the associated ceremonies that lack a
 * nominations or results date. Activation never depends on the result.
 */
export function findCeremoniesMissingDates(
  ceremonies: SeriesCeremonyDates[]
): MissingCeremonyDates[] {
  return [...ceremonies].sort(byEventThenCeremony).flatMap((c) => {
    const missing: MissingCeremonyDates["missing"] = [];
    if (!c.nominations_on) missing.push("nominations_on");
    if (!c.results_on) missing.push("results_on");
    if (missing.length === 0) return [];
    return [
      {
        ceremony_id: c.ceremony_id,
        ceremony_code: c.ceremony_code,
        ceremony_name: c.ceremony_name,
        missing
      }
    ];
  });
}

export type ScoringOccasionKind = "NOMINATION" | "WIN";

/** A `(ceremony, kind)` pair; derived from the ceremony and its dates, never stored. */
export type ScoringOccasion = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  series_event_id: number;
  event_code: string;
  kind: ScoringOccasionKind;
  /** Whole day, `YYYY-MM-DD`; null until an admin sets it. */
  date: string | null;
};

/**
 * Every associated ceremony has a nomination and a win occasion. Dated
 * occasions come first in date order, then undated ones in event order.
 * On a shared date occasions follow event order, and a ceremony's nomination
 * sorts before its win.
 */
export function listScoringOccasions(
  ceremonies: SeriesCeremonyDates[]
): ScoringOccasion[] {
  const order = new Map<number, number>();
  const occasions = [...ceremonies].sort(byEventThenCeremony).flatMap((c, i) => {
    order.set(c.ceremony_id, i);
    const base = {
      ceremony_id: c.ceremony_id,
      ceremony_code: c.ceremony_code,
      ceremony_name: c.ceremony_name,
      series_event_id: c.series_event_id,
      event_code: c.event_code
    };
    return [
      { ...base, kind: "NOMINATION" as const, date: c.nominations_on },
      { ...base, kind: "WIN" as const, date: c.results_on }
    ];
  });
  const kindRank = (k: ScoringOccasionKind) => (k === "NOMINATION" ? 0 : 1);
  return occasions.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return (
      (order.get(a.ceremony_id) ?? 0) - (order.get(b.ceremony_id) ?? 0) ||
      kindRank(a.kind) - kindRank(b.kind)
    );
  });
}
