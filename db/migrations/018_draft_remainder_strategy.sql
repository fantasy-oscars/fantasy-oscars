-- P1-002 FO-P1-003: Draft allocation remainder strategy

ALTER TABLE season
  ADD COLUMN remainder_strategy TEXT NOT NULL DEFAULT 'UNDRAFTED'
  CHECK (remainder_strategy IN ('UNDRAFTED', 'FULL_POOL'));

ALTER TABLE draft
  ADD COLUMN remainder_strategy TEXT NOT NULL DEFAULT 'UNDRAFTED'
  CHECK (remainder_strategy IN ('UNDRAFTED', 'FULL_POOL')),
  ADD COLUMN total_picks INT NULL,
  ADD COLUMN pick_timer_seconds INT NULL,
  ADD COLUMN auto_pick_strategy TEXT NULL CHECK (
    auto_pick_strategy IS NULL OR auto_pick_strategy IN (
      'NEXT_AVAILABLE',
      'RANDOM_SEED',
      'ALPHABETICAL',
      'CANONICAL',
      'SMART',
      'CUSTOM_USER'
    )
  ),
  ADD COLUMN pick_deadline_at TIMESTAMPTZ NULL,
  ADD COLUMN pick_timer_remaining_ms INT NULL,
  ADD COLUMN auto_pick_seed TEXT NULL,
  ADD COLUMN auto_pick_config JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_draft_remainder_strategy ON draft (remainder_strategy);
