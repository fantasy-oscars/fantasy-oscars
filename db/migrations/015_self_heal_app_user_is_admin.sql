-- Self-heal for environments where the baseline schema was partially applied.
--
-- If `app_user.is_admin` is missing, auth endpoints that SELECT/RETURN `is_admin`
-- will crash with a 500. This migration ensures the column exists.

DO $$
BEGIN
  IF to_regclass('public.app_user') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'app_user'
        AND column_name = 'is_admin'
    ) THEN
      ALTER TABLE public.app_user
        ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;

