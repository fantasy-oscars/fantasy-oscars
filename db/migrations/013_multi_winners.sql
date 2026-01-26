-- Allow multiple winners per category (ties).
-- Replace the unique constraint on (category_edition_id) with a unique pair constraint
-- on (category_edition_id, nomination_id).

DROP INDEX IF EXISTS public.uniq_ceremony_winner_category;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ceremony_winner_category_nomination
  ON public.ceremony_winner (category_edition_id, nomination_id);

