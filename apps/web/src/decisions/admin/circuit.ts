/*
 * Circuit admin decisions (ADR 0006). Pure: no IO.
 *
 * Structural edits (ceremonies, events, categories and mappings) stay open
 * after activation, but an ACTIVE Circuit asks the admin to confirm them
 * first. Only an ARCHIVED Circuit is read-only.
 */

export type CircuitDateField = "nominations_on" | "results_on";

/**
 * The results date is not entered: it is the ceremony datetime's date in
 * America/Los_Angeles (ADR 0007), so a missing one means the ceremony date.
 */
export const CIRCUIT_DATE_LABELS: Record<CircuitDateField, string> = {
  nominations_on: "Nominations date",
  results_on: "Ceremony date"
};

export function circuitStatusLabel(status: string | null | undefined): string {
  return String(status || "DRAFT").toUpperCase();
}

export function isCircuitEditable(status: string | null | undefined): boolean {
  return circuitStatusLabel(status) !== "ARCHIVED";
}

export function canActivateCircuit(status: string | null | undefined): boolean {
  return circuitStatusLabel(status) === "DRAFT";
}

/** An initialised league of the Circuit: a structural edit changes what it scores. */
export type AffectedLeague = { circuit_league_id: number; name: string; status: string };

/**
 * Owner question 6: structural edits are confirmed first on an ACTIVE
 * Circuit, and on any Circuit with initialised leagues.
 */
export function needsStructuralEditConfirm(
  status: string | null | undefined,
  leagueCount = 0
): boolean {
  return circuitStatusLabel(status) === "ACTIVE" || leagueCount > 0;
}

/** The confirmation text: names the initialised leagues the edit affects, if any. */
export function structuralEditMessage(args: {
  circuitName: string;
  action: string;
  leagues: readonly AffectedLeague[];
}): string {
  const { circuitName, action, leagues } = args;
  if (leagues.length === 0) {
    return `${circuitName} is active. ${action} changes how it is scored, and the change is recorded in the audit log.`;
  }
  const noun = leagues.length === 1 ? "league" : "leagues";
  return `${action} changes how ${leagues.length} initialised ${noun} score: ${leagues
    .map((l) => l.name)
    .join(", ")}. Their points are rebuilt, and the change is recorded in the audit log.`;
}

/** The leagues named in a "needs confirmation" error's details; empty when malformed. */
export function parseAffectedLeagues(
  details: Record<string, unknown> | undefined
): AffectedLeague[] {
  const raw = details?.affected_leagues;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    const league = l as Partial<AffectedLeague> | null;
    return league &&
      typeof league.circuit_league_id === "number" &&
      typeof league.name === "string"
      ? [
          {
            circuit_league_id: league.circuit_league_id,
            name: league.name,
            status: String(league.status ?? "")
          }
        ]
      : [];
  });
}

export function ceremonyLabel(c: {
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  ceremony_id?: number;
}): string {
  return c.ceremony_name || c.ceremony_code || `Ceremony ${c.ceremony_id ?? ""}`.trim();
}

/** One line per ceremony that lacks a date, e.g. "BAFTA 2027: ceremony date". */
export function describeMissingDates(
  missing: Array<{
    ceremony_id: number;
    ceremony_name?: string | null;
    ceremony_code?: string | null;
    missing: CircuitDateField[];
  }>
): string[] {
  return missing.map((m) => {
    const fields = m.missing.map((f) => CIRCUIT_DATE_LABELS[f].toLowerCase()).join(", ");
    return `${ceremonyLabel(m)}: ${fields}`;
  });
}

/** The ceremonies an admin can still add to a Circuit: those not yet associated. */
export function unassociatedCeremonies<T extends { id: number }>(
  all: T[],
  associatedIds: number[]
): T[] {
  const taken = new Set(associatedIds);
  return all.filter((c) => !taken.has(c.id));
}

/**
 * The ids in a new order with `id` moved one place up (-1) or down (+1);
 * null when it is already at that end or not listed.
 */
export function moveInOrder(ids: number[], id: number, delta: -1 | 1): number[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function circuitCategoryKindLabel(kind: string): string {
  return kind === "ACTING" ? "Acting" : "Film";
}

/**
 * The icons a Circuit category can take: every template icon, with those
 * another category of the Circuit already uses disabled and named, since a
 * season pill's icon is its only category cue. The current icon stays enabled.
 */
export function circuitCategoryIconOptions(
  iconCodes: readonly string[],
  categories: ReadonlyArray<{ id: number; name: string; icon_code: string | null }>,
  categoryId: number
): Array<{ value: string; label: string; disabled: boolean }> {
  const usedBy = new Map<string, string>();
  for (const c of categories) {
    if (c.id !== categoryId && c.icon_code) usedBy.set(c.icon_code, c.name);
  }
  return iconCodes.map((code) => {
    const holder = usedBy.get(code);
    return holder
      ? { value: code, label: `${code} (used by ${holder})`, disabled: true }
      : { value: code, label: code, disabled: false };
  });
}

/**
 * The category templates a Circuit category can be built from. Song
 * templates are left out: a Circuit selection is a film or a performance.
 */
export function circuitTemplateOptions<
  T extends { id: number; name: string; default_unit_kind: string }
>(templates: T[]): T[] {
  return templates.filter((t) => t.default_unit_kind !== "SONG");
}

/** An admin's unsaved mapping choices, by category edition id; null means "not mapped". */
export type MappingChoices = Record<number, number | null>;

type MappableEdition = {
  id: number;
  circuit_category_id: number | null;
  suggested_circuit_category_id: number | null;
};

/**
 * The Circuit category shown for a ceremony category: the admin's unsaved
 * choice, else the saved mapping, else the template suggestion. A choice that
 * points at a category that no longer exists shows as unmapped.
 */
export function effectiveMapping(
  edition: MappableEdition,
  choices: MappingChoices,
  circuitCategoryIds: number[]
): number | null {
  const value =
    edition.id in choices
      ? (choices[edition.id] ?? null)
      : (edition.circuit_category_id ?? edition.suggested_circuit_category_id);
  return value !== null && circuitCategoryIds.includes(value) ? value : null;
}

/** True when the shown mapping differs from what is saved. */
function isMappingUnsaved(
  edition: MappableEdition,
  choices: MappingChoices,
  circuitCategoryIds: number[]
): boolean {
  return (
    effectiveMapping(edition, choices, circuitCategoryIds) !== edition.circuit_category_id
  );
}

/** The writes a save sends: one per ceremony category whose shown mapping is unsaved. */
export function pendingMappingChanges(
  editions: MappableEdition[],
  choices: MappingChoices,
  circuitCategoryIds: number[]
): Array<{ categoryEditionId: number; circuitCategoryId: number | null }> {
  return editions
    .filter((e) => isMappingUnsaved(e, choices, circuitCategoryIds))
    .map((e) => ({
      categoryEditionId: e.id,
      circuitCategoryId: effectiveMapping(e, choices, circuitCategoryIds)
    }));
}

/** Whole-day dates are shown as stored (`YYYY-MM-DD`) so no time zone shifts them. */
export function dateOnlyLabel(value: string | null | undefined): string {
  return value ? value : "No date";
}

/**
 * The mapping modal's rows: one per Circuit category, with the ceremony
 * categories shown as feeding it and those it may still take. A ceremony
 * category feeds at most one Circuit category, so one chosen in another row
 * is not offered.
 */
export function mappingModalRows<E extends MappableEdition>(
  categoryIds: number[],
  editions: E[],
  choices: MappingChoices
): Array<{ circuitCategoryId: number; selected: E[]; options: E[] }> {
  return categoryIds.map((circuitCategoryId) => ({
    circuitCategoryId,
    selected: editions.filter(
      (e) => effectiveMapping(e, choices, categoryIds) === circuitCategoryId
    ),
    options: editions.filter((e) => {
      const shown = effectiveMapping(e, choices, categoryIds);
      return shown === null || shown === circuitCategoryId;
    })
  }));
}

/**
 * The choices after a row's multi-select changes: the listed ceremony
 * categories feed `circuitCategoryId`, and any it fed before that are no
 * longer listed are left unmapped.
 */
export function chooseMappingRow(
  editions: MappableEdition[],
  choices: MappingChoices,
  categoryIds: number[],
  circuitCategoryId: number,
  editionIds: number[]
): MappingChoices {
  const next = { ...choices };
  for (const e of editions) {
    if (editionIds.includes(e.id)) next[e.id] = circuitCategoryId;
    else if (effectiveMapping(e, choices, categoryIds) === circuitCategoryId) {
      next[e.id] = null;
    }
  }
  return next;
}
