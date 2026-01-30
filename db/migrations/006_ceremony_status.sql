-- Ceremony lifecycle (supports multiple concurrently-active ceremonies).
-- Active (visible to users) = PUBLISHED or LOCKED.
-- LOCKED stays active, but blocks creating new seasons/drafts for that ceremony.

ALTER TABLE public.ceremony
  ADD COLUMN status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN draft_warning_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN published_at timestamp with time zone,
  ADD COLUMN archived_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ceremony_status_check'
  ) THEN
    ALTER TABLE public.ceremony
      ADD CONSTRAINT ceremony_status_check
      CHECK (status IN ('DRAFT','PUBLISHED','LOCKED','ARCHIVED'));
  END IF;
END
$$;

