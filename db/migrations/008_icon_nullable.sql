-- Google icon support: icon value is primarily a text code (e.g. "e4eb", "e4eb-i").
-- Allow creating icons without a name/asset_path for now.

ALTER TABLE public.icon
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN asset_path DROP NOT NULL;

