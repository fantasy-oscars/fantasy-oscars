ALTER TABLE public.film
  ADD COLUMN IF NOT EXISTS consolidated_into_film_id bigint,
  ADD COLUMN IF NOT EXISTS consolidated_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'film_consolidated_into_film_id_fkey'
  ) THEN
    ALTER TABLE public.film
      ADD CONSTRAINT film_consolidated_into_film_id_fkey
      FOREIGN KEY (consolidated_into_film_id)
      REFERENCES public.film(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'film_consolidated_into_film_id_not_self'
  ) THEN
    ALTER TABLE public.film
      ADD CONSTRAINT film_consolidated_into_film_id_not_self
      CHECK (consolidated_into_film_id IS NULL OR consolidated_into_film_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_film_consolidated_into_film_id
  ON public.film (consolidated_into_film_id);
