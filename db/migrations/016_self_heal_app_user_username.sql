-- Self-heal for older DBs that still have `app_user.handle` but not `app_user.username`.
--
-- The current code expects `username`. Without it, auth/login can crash with:
--   column u.username does not exist
--
-- This adds `username`, backfills it from `handle` when possible, and attempts to
-- enforce NOT NULL only if safe.

DO $$
DECLARE
  null_count bigint;
BEGIN
  IF to_regclass('public.app_user') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_user'
      AND column_name = 'username'
  ) THEN
    ALTER TABLE public.app_user
      ADD COLUMN username text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_user'
      AND column_name = 'handle'
  ) THEN
    UPDATE public.app_user
      SET username = handle
      WHERE username IS NULL
        AND handle IS NOT NULL;
  END IF;

  SELECT COUNT(*) INTO null_count FROM public.app_user WHERE username IS NULL;
  IF null_count = 0 THEN
    ALTER TABLE public.app_user
      ALTER COLUMN username SET NOT NULL;
  END IF;

  -- Ensure a case-insensitive uniqueness constraint for username (best-effort).
  -- Older DBs may already have a similar constraint; IF NOT EXISTS keeps it safe.
  CREATE UNIQUE INDEX IF NOT EXISTS app_user_username_lower_key
    ON public.app_user USING btree (lower(username));
END $$;

