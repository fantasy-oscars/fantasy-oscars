ALTER TABLE season
  ADD COLUMN scoring_strategy_name TEXT NOT NULL DEFAULT 'fixed'
  CHECK (scoring_strategy_name IN ('fixed','negative'));

-- Backfill existing rows to default 'fixed'
UPDATE season SET scoring_strategy_name = 'fixed' WHERE scoring_strategy_name IS NULL;
