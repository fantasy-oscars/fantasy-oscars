-- Store TMDB credits payload (cast/crew) on films without requiring person ingestion.
-- This supports nominee canonicalization (choose person from a film's credits)
-- while deferring person hydration until needed.

ALTER TABLE public.film
  ADD COLUMN IF NOT EXISTS tmdb_credits jsonb;

