import type { SeriesDateField } from "../../../decisions/admin/series";

/** Response shapes of the `/admin/series` and `/admin/ceremonies/:id/series` routes. */

export type SeriesSummary = {
  id: number;
  code: string;
  name: string;
  status: string;
  opens_on: string | null;
  activated_at: string | null;
};

export type SeriesEvent = {
  id: number;
  series_id: number;
  code: string;
  name: string;
  sort_index: number;
};

export type SeriesCategory = {
  id: number;
  series_id: number;
  code: string;
  name: string;
  kind: "FILM" | "ACTING";
  sort_index: number;
};

export type SeriesCeremony = {
  series_id: number;
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  ceremony_status: string;
  series_event_id: number;
  event_code: string;
  event_name: string;
  event_sort_index: number;
  nominations_on: string | null;
  results_on: string | null;
};

export type SeriesCategoryEdition = {
  id: number;
  ceremony_id: number;
  code: string | null;
  name: string | null;
  sort_index: number;
  series_category_id: number | null;
};

export type MissingCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  missing: SeriesDateField[];
};

export type ScoringOccasion = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  series_event_id: number;
  event_code: string;
  kind: "NOMINATION" | "WIN";
  date: string | null;
};

export type SeriesDetail = {
  series: SeriesSummary;
  events: SeriesEvent[];
  categories: SeriesCategory[];
  ceremonies: SeriesCeremony[];
  category_editions: SeriesCategoryEdition[];
  readiness: { missing_dates: MissingCeremonyDates[] };
  occasions: ScoringOccasion[];
};

export type CeremonySeriesAssociation = {
  series_id: number;
  series_code: string;
  series_name: string;
  series_status: string;
  series_event_id: number;
  event_code: string;
  event_name: string;
};

export type CeremonySeriesOption = {
  id: number;
  code: string;
  name: string;
  status: string;
  events: SeriesEvent[];
};
