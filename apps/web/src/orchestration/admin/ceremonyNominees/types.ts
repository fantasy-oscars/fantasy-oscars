export type CeremonyCategory = {
  id: number;
  unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  family_name?: string;
  family_code?: string;
  family_icon_code?: string | null;
  family_icon_variant?: "default" | "inverted" | null;
};

export type CandidateFilm = {
  id: number;
  title: string;
  release_year?: number | null;
  tmdb_id?: number | null;
};

export type NominationContributorRow = {
  nomination_contributor_id?: number;
  person_id: number;
  full_name: string;
  tmdb_id?: number | null;
  role_label: string | null;
  sort_order: number;
};

export type NominationRow = {
  id: number;
  category_edition_id: number;
  sort_order?: number;
  display_film_id?: number | null;
  display_film_tmdb_id?: number | null;
  film_title?: string | null;
  song_title?: string | null;
  performer_name?: string | null;
  performer_character?: string | null;
  contributors?: NominationContributorRow[];
};

export type PersonSearchRow = {
  id: number;
  full_name: string;
  tmdb_id: number | null;
  profile_url?: string | null;
};

