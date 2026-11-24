import type { AffectedLeague, CircuitDateField } from "../../../decisions/admin/circuit";

/** Response shapes of the `/admin/circuits` and `/admin/ceremonies/:id/circuits` routes. */

export type CircuitSummary = {
  id: number;
  code: string;
  name: string;
  status: string;
  opens_on: string | null;
  activated_at: string | null;
};

export type CircuitEvent = {
  id: number;
  circuit_id: number;
  code: string;
  name: string;
  sort_index: number;
  /** An admin-made group; any other event is one ceremony's own, hidden plumbing. */
  is_group: boolean;
};

export type CircuitCategory = {
  id: number;
  circuit_id: number;
  code: string;
  name: string;
  kind: "FILM" | "ACTING";
  sort_index: number;
  category_family_id: number | null;
  icon_id: number | null;
  icon_code: string | null;
  icon_variant: string;
};

export type CircuitCeremony = {
  circuit_id: number;
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  ceremony_status: string;
  circuit_event_id: number;
  event_code: string;
  event_name: string;
  event_sort_index: number;
  event_is_group: boolean;
  /** Order inside the event. */
  sort_index: number;
  nominations_on: string | null;
  starts_at: string | null;
  /** Derived: the ceremony datetime's date in America/Los_Angeles. */
  results_on: string | null;
};

export type CircuitCategoryEdition = {
  id: number;
  ceremony_id: number;
  code: string | null;
  name: string | null;
  sort_index: number;
  family_id: number | null;
  circuit_category_id: number | null;
  /** Pre-selected on the mapping screen when the templates match; never saved by itself. */
  suggested_circuit_category_id: number | null;
};

export type MissingCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  missing: CircuitDateField[];
};

export type ScoringOccasion = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
  event_code: string;
  kind: "NOMINATION" | "WIN";
  date: string | null;
};

export type CircuitDetail = {
  circuit: CircuitSummary;
  events: CircuitEvent[];
  categories: CircuitCategory[];
  ceremonies: CircuitCeremony[];
  category_editions: CircuitCategoryEdition[];
  readiness: { missing_dates: MissingCeremonyDates[] };
  /** Leagues past SETUP: a ceremony or mapping change affects what they score. */
  initialized_leagues: AffectedLeague[];
  occasions: ScoringOccasion[];
  /** Add/drop windows as if every ceremony were enabled (ADR 0007). */
  waiver_windows: WaiverWindow[];
};

export type CoverageCeremony = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
};

export type CeremonyCoverage = CoverageCeremony & {
  supplies: Array<{
    circuit_category_id: number;
    code: string;
    name: string;
    edition_ids: number[];
  }>;
  unmapped_editions: Array<{ id: number; code: string; name: string }>;
  edition_count: number;
};

/** `GET /admin/circuits/:id/readiness`: what is left to do, and what each ceremony supplies. */
export type CircuitReadiness = {
  circuit: { id: number; code: string; name: string; status: string };
  ready: boolean;
  gaps: {
    missing_dates: MissingCeremonyDates[];
    ceremonies_without_mappings: CoverageCeremony[];
    categories_without_ceremony: Array<{ id: number; code: string; name: string }>;
    unmapped_edition_count: number;
    /** Never blocks readiness: these categories' pills show the neutral glyph. */
    categories_without_icon: Array<{ id: number; code: string; name: string }>;
    /** Icons more than one category uses, so their pills look alike. */
    shared_icons: Array<{
      icon_code: string;
      categories: Array<{ id: number; code: string; name: string }>;
    }>;
  };
  coverage: {
    ceremonies: CeremonyCoverage[];
    categories_without_ceremony: Array<{ id: number; code: string; name: string }>;
  };
  occasions: ScoringOccasion[];
  waiver_windows: WaiverWindow[];
};

export type WaiverWindow = {
  starts_on: string;
  ends_on: string;
  resolves_on: string;
  scoring_days: string[];
};

/** A category template a Circuit category can be built from. */
export type CircuitCategoryTemplate = {
  id: number;
  code: string;
  name: string;
  default_unit_kind: string;
};

export type CeremonyCircuitAssociation = {
  circuit_id: number;
  circuit_code: string;
  circuit_name: string;
  circuit_status: string;
  circuit_event_id: number;
  event_code: string;
  event_name: string;
  event_is_group: boolean;
};

export type CeremonyCircuitOption = {
  id: number;
  code: string;
  name: string;
  status: string;
  events: CircuitEvent[];
};
