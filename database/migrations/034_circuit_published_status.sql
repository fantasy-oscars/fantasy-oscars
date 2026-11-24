-- Circuit lifecycle: DRAFT, PUBLISHED, ACTIVE, ARCHIVED.
-- PUBLISHED is visible to players and open for seasons to be set up, but no
-- draft starts until the Circuit is ACTIVE. Existing rows keep their status:
-- nothing becomes PUBLISHED, so there is no backfill.

ALTER TABLE public.circuit
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

ALTER TABLE public.circuit DROP CONSTRAINT IF EXISTS circuit_status_check;
ALTER TABLE public.circuit
  ADD CONSTRAINT circuit_status_check
    CHECK (status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ACTIVE'::text, 'ARCHIVED'::text]));
