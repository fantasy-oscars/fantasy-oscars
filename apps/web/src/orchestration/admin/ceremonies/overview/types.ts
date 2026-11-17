import type { CeremonyStatus } from "../../../../decisions/ceremonyLifecycle";

export type CeremonyDetail = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  /** Whole day, `YYYY-MM-DD`; the results date is derived from `starts_at`. */
  nominations_on?: string | null;
  status: CeremonyStatus;
  draft_warning_hours: number;
  draft_locked_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  results_finalized_at: string | null;
};

export type CeremonyStats = {
  categories_total: number;
  categories_with_nominees: number;
  nominees_total: number;
  winners_total: number;
};

export type CeremonyOverviewFormState = {
  code: string;
  name: string;
  nominationsOn: string;
  startsAtLocal: string;
  warningHours: string;
};
