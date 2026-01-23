-- P1-002 FO-P1-003: Draft allocation remainder strategy

ALTER TABLE season
  ADD COLUMN remainder_strategy TEXT NOT NULL DEFAULT 'UNDRAFTED'
  CHECK (remainder_strategy IN ('UNDRAFTED', 'FULL_POOL'));

ALTER TABLE draft
  ADD COLUMN remainder_strategy TEXT NOT NULL DEFAULT 'UNDRAFTED'
  CHECK (remainder_strategy IN ('UNDRAFTED', 'FULL_POOL')),
  ADD COLUMN total_picks INT NULL;

CREATE INDEX IF NOT EXISTS idx_draft_remainder_strategy ON draft (remainder_strategy);
