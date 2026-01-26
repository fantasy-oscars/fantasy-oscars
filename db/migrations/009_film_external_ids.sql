-- Support importing film candidates from external sources (e.g. TMDB).
-- These are nullable because many films may be created manually.

ALTER TABLE public.film
  ADD COLUMN tmdb_id integer,
  ADD COLUMN ref text,
  ADD COLUMN release_year integer,
  ADD COLUMN external_ids jsonb;

-- Uniqueness for stable identifiers (NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS film_tmdb_id_key ON public.film (tmdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS film_ref_key ON public.film (ref);

