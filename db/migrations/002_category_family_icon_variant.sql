-- Add icon_variant to category_family for presentation-only icon styling.
ALTER TABLE public.category_family
  ADD COLUMN IF NOT EXISTS icon_variant text NOT NULL DEFAULT 'default'::text;

DO $$
BEGIN
  ALTER TABLE public.category_family
    ADD CONSTRAINT category_family_icon_variant_check
    CHECK (icon_variant IN ('default', 'inverted'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
