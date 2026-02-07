-- Category-weighted scoring strategy (season-level configuration).
-- Stores per-category weights (integer -99..99) on the season.

ALTER TABLE public.season
  ADD COLUMN IF NOT EXISTS category_weights jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.season
  DROP CONSTRAINT IF EXISTS season_scoring_strategy_name_check;

ALTER TABLE public.season
  ADD CONSTRAINT season_scoring_strategy_name_check
  CHECK (
    scoring_strategy_name = ANY (
      ARRAY['fixed'::text, 'negative'::text, 'category_weighted'::text]
    )
  );

