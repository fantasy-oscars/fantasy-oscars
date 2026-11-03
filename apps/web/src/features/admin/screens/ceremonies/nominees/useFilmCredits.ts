import { useCallback, useEffect, useState } from "react";

type CreditPerson = {
  tmdb_id?: number;
  id?: number;
  name?: string;
  character?: string | null;
  job?: string | null;
  department?: string | null;
  profile_path?: string | null;
  credit_id?: string | null;
};

export type FilmCredits = { cast?: CreditPerson[]; crew?: CreditPerson[] };

function coerceFilmCredits(creditsUnknown: unknown): FilmCredits | null {
  if (!creditsUnknown || typeof creditsUnknown !== "object") return null;
  const creditsObj = creditsUnknown as { cast?: unknown; crew?: unknown };
  const cast = Array.isArray(creditsObj.cast)
    ? (creditsObj.cast as CreditPerson[])
    : undefined;
  const crew = Array.isArray(creditsObj.crew)
    ? (creditsObj.crew as CreditPerson[])
    : undefined;
  return { cast, crew };
}

export function useFilmCredits(args: {
  filmId: number | null;
  filmLinked: boolean;
  getFilmCredits: (filmId: number) => Promise<unknown | null>;
}) {
  const { filmId, filmLinked, getFilmCredits } = args;
  // Credits are tagged with the film they were fetched for so a different film never
  // sees the previous film's cast and crew while its own fetch is in flight.
  const [loaded, setLoaded] = useState<{
    filmId: number | null;
    credits: FilmCredits | null;
  }>({ filmId: null, credits: null });
  const filmCredits = loaded.filmId === filmId ? loaded.credits : null;
  const setFilmCredits = useCallback(
    (credits: FilmCredits | null) => setLoaded({ filmId, credits }),
    [filmId]
  );

  useEffect(() => {
    // When the film is TMDB-linked, load credits so contributor pickers can use cast/crew.
    if (!filmId || !filmLinked) {
      setLoaded({ filmId, credits: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      const creditsUnknown = await getFilmCredits(filmId);
      if (cancelled) return;
      setLoaded({ filmId, credits: coerceFilmCredits(creditsUnknown) });
    })();

    return () => {
      cancelled = true;
    };
  }, [filmId, filmLinked, getFilmCredits]);

  return { filmCredits, setFilmCredits };
}
