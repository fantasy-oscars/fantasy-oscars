import {
  CONTENDER_SEARCH_MAX_LENGTH,
  CONTENDER_SEARCH_MIN_LENGTH,
  normalizeContenderQuery
} from "@fantasy-oscars/shared";

/*
 * Contender picker rules (pure). The picker goes category, then film, then
 * person for acting categories; these functions say which step comes next,
 * what to search for and how to explain a failure.
 */

export type ContenderCategoryKind = "FILM" | "ACTING";

export type ContenderCategory = { id: number; name: string; kind: ContenderCategoryKind };

export type ContenderFilm = {
  tmdb_id: number;
  title: string;
  release_year: number | null;
  poster_url: string | null;
};

export type ContenderPerson = {
  tmdb_id: number;
  name: string;
  /** Character for cast, job for crew. */
  role: string | null;
  profile_url: string | null;
};

export type ContenderCredits = {
  cast: Array<{
    tmdb_id: number;
    name: string;
    character: string | null;
    profile_url: string | null;
  }>;
  crew: Array<{
    tmdb_id: number;
    name: string;
    job: string | null;
    profile_url: string | null;
  }>;
};

export type ContenderPickerStep = "category" | "film" | "person" | "confirm";

export function contenderPickerStep(input: {
  category: ContenderCategory | null;
  film: ContenderFilm | null;
  person: ContenderPerson | null;
}): ContenderPickerStep {
  if (!input.category) return "category";
  if (!input.film) return "film";
  if (input.category.kind === "ACTING" && !input.person) return "person";
  return "confirm";
}

/**
 * The text to search for, or null with a hint when the input is too short or
 * too long. Uses the server's normalisation so the two agree.
 */
export function contenderSearchTerm(input: string): {
  term: string | null;
  hint: string | null;
} {
  const term = normalizeContenderQuery(input);
  if (term.length === 0) return { term: null, hint: null };
  if (term.length < CONTENDER_SEARCH_MIN_LENGTH) {
    return {
      term: null,
      hint: `Type at least ${CONTENDER_SEARCH_MIN_LENGTH} characters to search`
    };
  }
  if (term.length > CONTENDER_SEARCH_MAX_LENGTH) {
    return {
      term: null,
      hint: `Search must be ${CONTENDER_SEARCH_MAX_LENGTH} characters or fewer`
    };
  }
  return { term, hint: null };
}

/**
 * Everyone credited on a film, cast first in billing order, then crew. A
 * person with several credits appears once, with their first role.
 */
export function contenderPeople(credits: ContenderCredits): ContenderPerson[] {
  const seen = new Set<number>();
  const people: ContenderPerson[] = [];
  const add = (p: ContenderPerson) => {
    if (seen.has(p.tmdb_id)) return;
    seen.add(p.tmdb_id);
    people.push(p);
  };
  for (const c of credits.cast) {
    add({
      tmdb_id: c.tmdb_id,
      name: c.name,
      role: c.character || null,
      profile_url: c.profile_url
    });
  }
  for (const c of credits.crew) {
    add({
      tmdb_id: c.tmdb_id,
      name: c.name,
      role: c.job || null,
      profile_url: c.profile_url
    });
  }
  return people;
}

/** People whose name or role contains the filter, ignoring case and accents. */
export function filterContenderPeople(
  people: readonly ContenderPerson[],
  filter: string
): ContenderPerson[] {
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = fold(filter.trim());
  if (!needle) return [...people];
  return people.filter(
    (p) => fold(p.name).includes(needle) || fold(p.role ?? "").includes(needle)
  );
}

export function contenderFilmLabel(film: Pick<ContenderFilm, "title" | "release_year">) {
  return film.release_year ? `${film.title} (${film.release_year})` : film.title;
}

/** A person-facing message for a failed search, credits lookup or pick. */
export function contenderErrorMessage(res: {
  status?: number;
  errorCode?: string;
  error?: string;
}): string {
  switch (res.errorCode) {
    case "VALIDATION_ERROR":
    case "PERSON_NOT_IN_CREDITS":
    case "CIRCUIT_ARCHIVED":
      return res.error ?? "Please check your choice and try again.";
    case "FORBIDDEN":
      return "Join a league to pick contenders.";
    case "TMDB_NOT_FOUND":
      return "That film is no longer listed on TMDB.";
    case "TMDB_UNAVAILABLE":
      return "Film search is unavailable right now. Try again in a few minutes.";
    case "TMDB_UPSTREAM_ERROR":
      return "Film search ran into a problem. Try again.";
    default:
      break;
  }
  if (res.status === 429) return "Too many searches. Wait a minute, then try again.";
  if (res.status === 503) {
    return "Film search is unavailable right now. Try again in a few minutes.";
  }
  if (res.status === 404) return "That category is not open for picks.";
  return res.error ?? "Something went wrong. Please try again.";
}
