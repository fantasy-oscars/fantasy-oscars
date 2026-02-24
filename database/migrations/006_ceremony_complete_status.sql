-- Add a ceremony lifecycle state between LOCKED (winners being entered) and ARCHIVED.
-- COMPLETE indicates winners are finalized and can drive results-mode UX.

ALTER TABLE public.ceremony DROP CONSTRAINT IF EXISTS ceremony_status_check;

ALTER TABLE public.ceremony
  ADD CONSTRAINT ceremony_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'DRAFT'::text,
        'PUBLISHED'::text,
        'LOCKED'::text,
        'COMPLETE'::text,
        'ARCHIVED'::text
      ]
    )
  );

