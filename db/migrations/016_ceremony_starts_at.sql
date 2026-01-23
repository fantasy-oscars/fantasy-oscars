-- Add ceremony start time to support pre-ceremony draft integrity warnings

ALTER TABLE ceremony
  ADD COLUMN starts_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_ceremony_starts_at ON ceremony (starts_at);
