import { Modal, Stack } from "@ui";
import { useMemo } from "react";
import { NominationEditFilmSection } from "./NominationEditFilmSection";
import { NominationEditPeopleSection } from "./NominationEditPeopleSection";
import { useFilmCredits } from "./useFilmCredits";

export function NominationEditModal(props: {
  nomination: null | {
    id: number;
    display_film_id?: number | null;
    film_title?: string | null;
    contributors?: Array<{
      nomination_contributor_id?: number;
      person_id: number;
      full_name: string;
      tmdb_id?: number | null;
      role_label: string | null;
      sort_order: number;
    }>;
  };
  films: Array<{
    id: number;
    title: string;
    tmdb_id?: number | null;
    release_year?: number | null;
  }>;
  people: Array<{ id: number; full_name: string; tmdb_id: number | null }>;
  peopleLoading: boolean;
  onClose: () => void;
  onLinkFilm: (
    filmId: number,
    tmdbId: number | null
  ) => Promise<
    | { ok: true; hydrated: boolean }
    | {
        ok: false;
        hydrated: boolean;
        error: string;
        errorCode?: string;
        errorDetails?: Record<string, unknown>;
      }
  >;
  onLinkPerson: (
    personId: number,
    tmdbId: number | null
  ) => Promise<
    | { ok: true; hydrated: boolean }
    | {
        ok: false;
        hydrated: boolean;
        error: string;
        errorCode?: string;
        errorDetails?: Record<string, unknown>;
      }
  >;
  onAddContributor: (
    nominationId: number,
    input: { person_id?: number; name?: string; tmdb_id?: number }
  ) => Promise<void>;
  onRemoveContributor: (
    nominationId: number,
    nominationContributorId: number
  ) => Promise<void>;
  getFilmCredits: (filmId: number) => Promise<unknown | null>;
}) {
  const {
    nomination,
    films,
    people,
    peopleLoading,
    onClose,
    onLinkFilm,
    onLinkPerson,
    onAddContributor,
    onRemoveContributor,
    getFilmCredits
  } = props;

  const filmId = nomination?.display_film_id ?? null;
  const film = filmId ? (films.find((f) => f.id === filmId) ?? null) : null;
  const filmLinked = Boolean(film?.tmdb_id);

  const { filmCredits, setFilmCredits } = useFilmCredits({
    filmId,
    filmLinked,
    getFilmCredits
  });

  const contributorRows = useMemo(() => {
    return (nomination?.contributors ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [nomination?.contributors]);

  if (!nomination) return null;

  return (
    <Modal
      opened
      onClose={onClose}
      title="Edit nomination"
      centered
      size="lg"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <NominationEditFilmSection
          nominationFilmTitle={nomination.film_title ?? "—"}
          film={film ? { id: film.id, title: film.title, tmdb_id: film.tmdb_id ?? null } : null}
          onLinkFilm={onLinkFilm}
          onAfterLinkChange={() => {
            // Ensure contributor pickers don't show stale credits after unlinking/relinking.
            setFilmCredits(null);
          }}
        />

        <NominationEditPeopleSection
          nominationId={nomination.id}
          contributors={contributorRows}
          people={people}
          peopleLoading={peopleLoading}
          filmCredits={filmCredits}
          onLinkPerson={onLinkPerson}
          onAddContributor={onAddContributor}
          onRemoveContributor={onRemoveContributor}
        />
      </Stack>
    </Modal>
  );
}
