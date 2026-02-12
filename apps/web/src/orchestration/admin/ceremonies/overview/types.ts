export type CeremonyDetail = {
  id: number;
  code: string | null;
  name: string | null;
  starts_at: string | null;
  status: "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED";
  draft_warning_hours: number;
  draft_locked_at: string | null;
  published_at: string | null;
  archived_at: string | null;
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
  startsAtLocal: string;
  warningHours: string;
};
