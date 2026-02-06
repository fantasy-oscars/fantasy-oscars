-- Private leagues should not be mechanically coupled to a single ceremony.
-- Public season container leagues remain ceremony-scoped.
ALTER TABLE public.league
  ALTER COLUMN ceremony_id DROP NOT NULL;

