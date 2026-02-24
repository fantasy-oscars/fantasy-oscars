-- Add per-user avatar key (pre-launch; safe to backfill).
ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS avatar_key text;

UPDATE public.app_user
SET avatar_key = COALESCE(avatar_key, 'monkey'::text);

ALTER TABLE public.app_user
  ALTER COLUMN avatar_key SET DEFAULT 'monkey'::text;

ALTER TABLE public.app_user
  ALTER COLUMN avatar_key SET NOT NULL;

