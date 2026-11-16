-- Circuit: rename Series and make its structure admin-defined (ADR 0006).
-- The series_* tables become circuit_*, with their columns, constraints,
-- indexes and sequences. Events and categories lose their fixed code lists:
-- admins group ceremonies into events and build categories from category
-- templates. Existing rows, associations and mappings are kept.

-- ---------------------------------------------------------------------------
-- circuit
-- ---------------------------------------------------------------------------
ALTER TABLE public.series RENAME TO circuit;
ALTER SEQUENCE public.series_id_seq RENAME TO circuit_id_seq;
ALTER TABLE public.circuit RENAME CONSTRAINT series_pkey TO circuit_pkey;
ALTER TABLE public.circuit RENAME CONSTRAINT series_code_key TO circuit_code_key;
ALTER TABLE public.circuit RENAME CONSTRAINT series_status_check TO circuit_status_check;
ALTER TABLE public.circuit
  RENAME CONSTRAINT series_active_activated_at_check TO circuit_active_activated_at_check;

-- ---------------------------------------------------------------------------
-- circuit_event: an admin-defined group of one or more ceremonies
-- ---------------------------------------------------------------------------
ALTER TABLE public.series_event RENAME TO circuit_event;
ALTER SEQUENCE public.series_event_id_seq RENAME TO circuit_event_id_seq;
ALTER TABLE public.circuit_event RENAME COLUMN series_id TO circuit_id;
ALTER TABLE public.circuit_event RENAME CONSTRAINT series_event_pkey TO circuit_event_pkey;
ALTER TABLE public.circuit_event
  RENAME CONSTRAINT series_event_series_id_fkey TO circuit_event_circuit_id_fkey;
ALTER TABLE public.circuit_event
  RENAME CONSTRAINT series_event_series_code_key TO circuit_event_circuit_code_key;
ALTER TABLE public.circuit_event
  RENAME CONSTRAINT series_event_series_id_id_key TO circuit_event_circuit_id_id_key;
ALTER TABLE public.circuit_event DROP CONSTRAINT series_event_code_check;

-- ---------------------------------------------------------------------------
-- circuit_category: built from a category template (copy-on-add)
-- ---------------------------------------------------------------------------
ALTER TABLE public.series_category RENAME TO circuit_category;
ALTER SEQUENCE public.series_category_id_seq RENAME TO circuit_category_id_seq;
ALTER TABLE public.circuit_category RENAME COLUMN series_id TO circuit_id;
ALTER TABLE public.circuit_category
  RENAME CONSTRAINT series_category_pkey TO circuit_category_pkey;
ALTER TABLE public.circuit_category
  RENAME CONSTRAINT series_category_series_id_fkey TO circuit_category_circuit_id_fkey;
ALTER TABLE public.circuit_category
  RENAME CONSTRAINT series_category_series_code_key TO circuit_category_circuit_code_key;
ALTER TABLE public.circuit_category
  RENAME CONSTRAINT series_category_series_id_id_key TO circuit_category_circuit_id_id_key;
ALTER TABLE public.circuit_category DROP CONSTRAINT series_category_code_check;
ALTER TABLE public.circuit_category DROP CONSTRAINT series_category_kind_check;

-- Selection identity has a film and an acting role, never a song (ADR 0005,
-- section 5), so kind stays one of these two.
ALTER TABLE public.circuit_category
  ADD CONSTRAINT circuit_category_kind_check
  CHECK (kind = ANY (ARRAY['FILM'::text, 'ACTING'::text]));

-- The source template, and the icon copied from it. Templates are shared
-- reference data and may be edited or deleted without touching the Circuit.
ALTER TABLE public.circuit_category
  ADD COLUMN category_family_id bigint NULL
    REFERENCES public.category_family(id) ON DELETE SET NULL,
  ADD COLUMN icon_id bigint NULL REFERENCES public.icon(id),
  ADD COLUMN icon_variant text NOT NULL DEFAULT 'default';

ALTER TABLE public.circuit_category
  ADD CONSTRAINT circuit_category_icon_variant_check
  CHECK (icon_variant = ANY (ARRAY['default'::text, 'inverted'::text]));

-- Existing categories keep their rows; link the template whose code matches.
UPDATE public.circuit_category cc
SET
  category_family_id = cf.id,
  icon_id = cf.icon_id,
  icon_variant = cf.icon_variant
FROM public.category_family cf
WHERE lower(cf.code) = lower(cc.code);

-- ---------------------------------------------------------------------------
-- circuit_ceremony: every associated ceremony belongs to one event
-- ---------------------------------------------------------------------------
ALTER TABLE public.series_ceremony RENAME TO circuit_ceremony;
ALTER TABLE public.circuit_ceremony RENAME COLUMN series_id TO circuit_id;
ALTER TABLE public.circuit_ceremony RENAME COLUMN series_event_id TO circuit_event_id;
ALTER TABLE public.circuit_ceremony
  RENAME CONSTRAINT series_ceremony_pkey TO circuit_ceremony_pkey;
ALTER TABLE public.circuit_ceremony
  RENAME CONSTRAINT series_ceremony_series_id_fkey TO circuit_ceremony_circuit_id_fkey;
ALTER TABLE public.circuit_ceremony
  RENAME CONSTRAINT series_ceremony_ceremony_id_fkey TO circuit_ceremony_ceremony_id_fkey;
ALTER TABLE public.circuit_ceremony
  RENAME CONSTRAINT series_ceremony_event_fkey TO circuit_ceremony_event_fkey;
ALTER INDEX public.series_ceremony_ceremony_idx RENAME TO circuit_ceremony_ceremony_idx;

-- ---------------------------------------------------------------------------
-- circuit_mapping: many ceremony categories to one Circuit category
-- ---------------------------------------------------------------------------
-- The key stays (circuit_id, category_edition_id): a ceremony category maps to
-- at most one Circuit category, and any number may map to the same one.
ALTER TABLE public.series_mapping RENAME TO circuit_mapping;
ALTER TABLE public.circuit_mapping RENAME COLUMN series_id TO circuit_id;
ALTER TABLE public.circuit_mapping
  RENAME COLUMN series_category_id TO circuit_category_id;
ALTER TABLE public.circuit_mapping
  RENAME CONSTRAINT series_mapping_pkey TO circuit_mapping_pkey;
ALTER TABLE public.circuit_mapping
  RENAME CONSTRAINT series_mapping_series_id_fkey TO circuit_mapping_circuit_id_fkey;
ALTER TABLE public.circuit_mapping
  RENAME CONSTRAINT series_mapping_category_edition_id_fkey
  TO circuit_mapping_category_edition_id_fkey;
ALTER TABLE public.circuit_mapping
  RENAME CONSTRAINT series_mapping_category_fkey TO circuit_mapping_category_fkey;
ALTER INDEX public.series_mapping_category_edition_idx
  RENAME TO circuit_mapping_category_edition_idx;

-- ---------------------------------------------------------------------------
-- Named NOT NULL constraints (Postgres 18 stores them as series_*_not_null)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conrelid::regclass AS rel, con.conname
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'n'
      AND con.conname LIKE 'series%'
      AND con.conrelid IN (
        'public.circuit'::regclass,
        'public.circuit_event'::regclass,
        'public.circuit_category'::regclass,
        'public.circuit_ceremony'::regclass,
        'public.circuit_mapping'::regclass
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
      r.rel,
      r.conname,
      replace(r.conname, 'series', 'circuit')
    );
  END LOOP;
END
$$;
