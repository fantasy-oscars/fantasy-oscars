/*
 * Circuit domain (ADR 0006, which supersedes parts of ADR 0005). Pure: no IO.
 *
 * Admins define a Circuit's events (groups of ceremonies) and its categories
 * (built from category templates); nothing here fixes either list.
 */

import { AppError } from "../errors.js";

export const circuitStatuses = ["DRAFT", "PUBLISHED", "ACTIVE", "ARCHIVED"] as const;
export type CircuitStatus = (typeof circuitStatuses)[number];

/**
 * Seasons can be set up once the Circuit is visible to players: while it is
 * published and after it goes live. A DRAFT Circuit is admin-only.
 */
export function isCircuitOpenForSeasons(status: string): boolean {
  return status === "PUBLISHED" || status === "ACTIVE";
}

/** Drafts start only once the Circuit is live. */
export function isCircuitLive(status: string): boolean {
  return status === "ACTIVE";
}

export function assertCircuitLive(status: string) {
  if (!isCircuitLive(status)) {
    throw new AppError(
      "CIRCUIT_NOT_LIVE",
      409,
      "This season isn't open yet. You can start the draft once it is.",
      { status }
    );
  }
}

export type CircuitCategoryKind = "FILM" | "ACTING";

/**
 * A Circuit category's kind, from its template's default unit kind. Song
 * templates have no kind: selection identity has no song (ADR 0005, section 5).
 */
export function circuitCategoryKindForUnitKind(
  unitKind: string
): CircuitCategoryKind | null {
  if (unitKind === "FILM") return "FILM";
  if (unitKind === "PERFORMANCE") return "ACTING";
  return null;
}

/** Lowercase letters, digits and single dashes, from any label. */
export function codeFromLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `base`, or `base-2`, `base-3`... when taken. Codes are unique within one
 * Circuit; comparison ignores case so a generated code never shadows an older
 * upper-case one.
 */
export function uniqueCode(base: string, taken: Iterable<string>, fallback = "item") {
  const used = new Set([...taken].map((c) => c.toLowerCase()));
  const root = base || fallback;
  if (!used.has(root.toLowerCase())) return root;
  for (let n = 2; ; n += 1) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** True when `ids` lists every one of `current` exactly once. */
export function isFullOrdering(ids: readonly number[], current: readonly number[]) {
  if (ids.length !== current.length) return false;
  const expected = new Set(current);
  return new Set(ids).size === ids.length && ids.every((id) => expected.has(id));
}

/**
 * The Circuit category to pre-select for a ceremony category: the one built
 * from the same template. None when the template is unknown or more than one
 * Circuit category shares it. A suggestion is never saved by itself.
 */
export function suggestCircuitCategoryId(
  familyId: number | null,
  categories: ReadonlyArray<{ id: number; category_family_id: number | null }>
): number | null {
  if (familyId === null) return null;
  const matches = categories.filter((c) => c.category_family_id === familyId);
  return matches.length === 1 ? matches[0]!.id : null;
}

/**
 * `ids` with `id` moved to `index` (clamped to the list), or appended when it
 * was not in the list. The order of the other ids is kept.
 */
export function moveToIndex(ids: readonly number[], id: number, index: number): number[] {
  const rest = ids.filter((other) => other !== id);
  const at = Math.max(0, Math.min(Math.trunc(index), rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Results are announced on the ceremony's own day, in Pacific time (ADR 0007). */
export const RESULTS_TIME_ZONE = "America/Los_Angeles";

const resultsDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESULTS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/**
 * A ceremony's results date: the date of its ceremony datetime in
 * America/Los_Angeles, as `YYYY-MM-DD`. Null when the datetime is unset.
 */
export function resultsDateOf(startsAt: Date | string | null): string | null {
  if (startsAt === null) return null;
  const instant = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(
    resultsDayFormat.formatToParts(instant).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const zoneClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: RESULTS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** How far America/Los_Angeles wall time is ahead of UTC at `instant` (negative). */
function zoneOffsetMs(instant: number): number {
  const p = Object.fromEntries(
    zoneClockFormat.formatToParts(new Date(instant)).map((x) => [x.type, x.value])
  );
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a day stands for: 00:00 America/Los_Angeles on `day`
 * (`YYYY-MM-DD`). Ownership at an occasion and waiver-window boundaries use
 * it (owner question 9). Pacific clocks change at 02:00, so midnight always
 * exists and is unambiguous; its UTC offset follows daylight saving time.
 */
export function instantOfDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`Not a YYYY-MM-DD day: ${day}`);
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // The offset at the first guess can be an hour off on a change day; the
  // second pass uses the offset at the guessed instant itself.
  const guess = wall - zoneOffsetMs(wall);
  return new Date(wall - zoneOffsetMs(guess));
}

/** An associated ceremony with the dates that drive its scoring occasions. */
export type CircuitCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
  event_code: string;
  event_sort_index: number;
  /** Order inside the event. */
  sort_index: number;
  /** Whole day, `YYYY-MM-DD`. */
  nominations_on: string | null;
  /** The ceremony datetime; the results date is derived from it. */
  starts_at: Date | null;
};

/** The ceremony with its derived results date, for responses. */
export function withResultsDate<T extends { starts_at: Date | null }>(
  ceremony: T
): T & { results_on: string | null } {
  return { ...ceremony, results_on: resultsDateOf(ceremony.starts_at) };
}

export type MissingCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  missing: Array<"nominations_on" | "results_on">;
};

function byEventThenCeremony(a: CircuitCeremonyDates, b: CircuitCeremonyDates) {
  return (
    a.event_sort_index - b.event_sort_index ||
    a.sort_index - b.sort_index ||
    a.ceremony_id - b.ceremony_id
  );
}

/**
 * Soft readiness check for activation: the associated ceremonies that lack a
 * nominations date, or a results date because their ceremony datetime is
 * unset. Activation never depends on the result.
 */
export function findCeremoniesMissingDates(
  ceremonies: CircuitCeremonyDates[]
): MissingCeremonyDates[] {
  return [...ceremonies].sort(byEventThenCeremony).flatMap((c) => {
    const missing: MissingCeremonyDates["missing"] = [];
    if (!c.nominations_on) missing.push("nominations_on");
    if (!resultsDateOf(c.starts_at)) missing.push("results_on");
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
  circuit_event_id: number;
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
  ceremonies: CircuitCeremonyDates[]
): ScoringOccasion[] {
  const order = new Map<number, number>();
  const occasions = [...ceremonies].sort(byEventThenCeremony).flatMap((c, i) => {
    order.set(c.ceremony_id, i);
    const base = {
      ceremony_id: c.ceremony_id,
      ceremony_code: c.ceremony_code,
      ceremony_name: c.ceremony_name,
      circuit_event_id: c.circuit_event_id,
      event_code: c.event_code
    };
    return [
      { ...base, kind: "NOMINATION" as const, date: c.nominations_on },
      { ...base, kind: "WIN" as const, date: resultsDateOf(c.starts_at) }
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
