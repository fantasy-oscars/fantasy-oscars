-- Add tombstone columns used by admin safeguards soft-delete flows.

ALTER TABLE public.ceremony
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.league
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.season
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

