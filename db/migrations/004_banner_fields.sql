-- Banner + dynamic CMS enhancements
-- - Allow multiple published entries for key='banner'
-- - Add basic banner scheduling + variant + dismissible flags

ALTER TABLE public.cms_dynamic_content
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS dismissible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

DO $$
BEGIN
  -- Postgres doesn't support "ADD CONSTRAINT IF NOT EXISTS", so we guard manually.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cms_dynamic_content_variant_check'
  ) THEN
    -- nothing
  ELSE
    ALTER TABLE public.cms_dynamic_content
      ADD CONSTRAINT cms_dynamic_content_variant_check
      CHECK (variant IN ('info', 'warning', 'success', 'error'));
  END IF;
END $$;

-- Replace the "one published per key" index with an exception for banners.
DROP INDEX IF EXISTS public.cms_dynamic_content_one_published_per_key;

CREATE UNIQUE INDEX IF NOT EXISTS cms_dynamic_content_one_published_per_key_except_banner
  ON public.cms_dynamic_content (key)
  WHERE status = 'PUBLISHED' AND key <> 'banner';
