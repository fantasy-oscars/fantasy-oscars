import { useEffect, useState } from "react";

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
  const [filmCredits, setFilmCredits] = useState<FilmCredits | null>(null);

  useEffect(() => {
    // When the film is TMDB-linked, load credits so contributor pickers can use cast/crew.
    if (!filmId || !filmLinked) {
      setFilmCredits(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const creditsUnknown = await getFilmCredits(filmId);
      if (cancelled) return;
      setFilmCredits(coerceFilmCredits(creditsUnknown));
    })();

    return () => {
      cancelled = true;
    };
  }, [filmId, filmLinked, getFilmCredits]);

  return { filmCredits, setFilmCredits };
}
