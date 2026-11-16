import type { CircuitDateField } from "../../../decisions/admin/circuit";

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
  nominations_on: string | null;
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
  occasions: ScoringOccasion[];
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
};

export type CeremonyCircuitOption = {
  id: number;
  code: string;
  name: string;
  status: string;
  events: CircuitEvent[];
};
