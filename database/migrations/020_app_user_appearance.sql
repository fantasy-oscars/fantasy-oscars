-- Appearance: mode, Random selection, discoveries and the saved theme of the day.
-- Values are validated by the API; see packages/shared/src/schemas/account.ts.
ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS mode_preference text,
  ADD COLUMN IF NOT EXISTS random_excluded_brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS undiscovered_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS single_mode_policy text NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS discovered_brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS daily_draw jsonb;
