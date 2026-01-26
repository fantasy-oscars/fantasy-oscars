-- Ceremony-scoped candidate pool (pre-nominations import + manual additions).

CREATE TABLE IF NOT EXISTS public.ceremony_film_candidate (
  ceremony_id bigint NOT NULL REFERENCES public.ceremony(id) ON DELETE CASCADE,
  film_id bigint NOT NULL REFERENCES public.film(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'IMPORT',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ceremony_film_candidate_source_check CHECK (source IN ('IMPORT','MANUAL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ceremony_film_candidate_unique
  ON public.ceremony_film_candidate (ceremony_id, film_id);

