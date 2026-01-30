-- Allow creating leagues before an active ceremony is configured.
-- This enables a "set up the league first, attach a ceremony later" workflow.

ALTER TABLE public.league
  ALTER COLUMN ceremony_id DROP NOT NULL;

