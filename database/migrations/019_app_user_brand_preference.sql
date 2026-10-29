-- Optional visual brand preference: "rotate", "random" or a brand slug.
-- NULL means unset (treated as "rotate"). Values are validated by the API.
ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS brand_preference text;
