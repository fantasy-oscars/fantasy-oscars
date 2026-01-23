-- P1-005 FO-P1-002: Commissioner override to allow drafting after winners begin

ALTER TABLE draft
  ADD COLUMN allow_drafting_after_lock BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN lock_override_set_by_user_id INT NULL,
  ADD COLUMN lock_override_set_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_draft_allow_drafting_after_lock ON draft (allow_drafting_after_lock);
