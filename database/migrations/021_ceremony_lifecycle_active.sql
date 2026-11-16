-- Ceremony lifecycle: DRAFT, PUBLISHED, ACTIVE, LOCKED, ARCHIVED.
-- PUBLISHED is visible but closed to leagues; ACTIVE opens seasons and drafts.
-- Finalized results move out of the status column into results_finalized_at,
-- so the former terminal results status (added in 006) is folded into LOCKED.

ALTER TABLE public.ceremony
  ADD COLUMN IF NOT EXISTS results_finalized_at timestamptz NULL;

-- The old check rejects ACTIVE, so drop it before the backfill. The migration
-- runner applies this file in one transaction.
ALTER TABLE public.ceremony DROP CONSTRAINT IF EXISTS ceremony_status_check;

-- Published ceremonies already allow league interaction, which is ACTIVE now.
UPDATE public.ceremony SET status = 'ACTIVE' WHERE status = 'PUBLISHED';

-- Finalized ceremonies: the finalize audit entry, else the latest winner write.
UPDATE public.ceremony c
SET status = 'LOCKED',
    results_finalized_at = COALESCE(
      (
        SELECT max(a.created_at)
        FROM public.admin_audit_log a
        WHERE a.action = 'finalize_winners'
          AND a.target_type = 'ceremony'
          AND a.target_id = c.id
      ),
      (
        SELECT max(w.updated_at)
        FROM public.ceremony_winner w
        WHERE w.ceremony_id = c.id
      ),
      now()
    )
WHERE c.status = 'COMPLETE';

-- Archive required finalized results; soft delete did not, so only archived
-- ceremonies with winners count as finalized.
UPDATE public.ceremony c
SET results_finalized_at = COALESCE(c.archived_at, now())
WHERE c.status = 'ARCHIVED'
  AND c.results_finalized_at IS NULL
  AND EXISTS (SELECT 1 FROM public.ceremony_winner w WHERE w.ceremony_id = c.id);

ALTER TABLE public.ceremony
  ADD CONSTRAINT ceremony_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'DRAFT'::text,
        'PUBLISHED'::text,
        'ACTIVE'::text,
        'LOCKED'::text,
        'ARCHIVED'::text
      ]
    )
  );
