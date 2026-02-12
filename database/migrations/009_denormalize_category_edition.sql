-- Denormalize category template fields onto category_edition so ceremonies do not
-- depend on category_family for display (templates can be edited/deleted safely).

ALTER TABLE public.category_edition
  ADD COLUMN code text,
  ADD COLUMN name text,
  ADD COLUMN icon_variant text NOT NULL DEFAULT 'default';

ALTER TABLE public.category_edition
  ADD CONSTRAINT category_edition_icon_variant_check
  CHECK (icon_variant = ANY (ARRAY['default'::text, 'inverted'::text]));

-- Backfill from the referenced template.
UPDATE public.category_edition ce
SET
  code = cf.code,
  name = cf.name,
  icon_variant = COALESCE(cf.icon_variant, 'default'),
  icon_id = COALESCE(ce.icon_id, cf.icon_id)
FROM public.category_family cf
WHERE cf.id = ce.family_id;

-- Enforce per-ceremony uniqueness of category code (templates are global but
-- ceremonies can reuse the same codes independently).
ALTER TABLE public.category_edition
  DROP CONSTRAINT IF EXISTS category_edition_ceremony_id_family_id_key;

ALTER TABLE public.category_edition
  ADD CONSTRAINT category_edition_ceremony_id_code_key UNIQUE (ceremony_id, code);

-- Make the template reference optional and non-blocking for template deletion.
ALTER TABLE public.category_edition
  ALTER COLUMN family_id DROP NOT NULL;

ALTER TABLE public.category_edition
  DROP CONSTRAINT IF EXISTS category_edition_family_id_fkey;

ALTER TABLE public.category_edition
  ADD CONSTRAINT category_edition_family_id_fkey
  FOREIGN KEY (family_id) REFERENCES public.category_family(id) ON DELETE SET NULL;

-- Code/name are now required ceremony-side identity.
ALTER TABLE public.category_edition
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

