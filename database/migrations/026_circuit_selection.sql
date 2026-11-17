-- Circuit selections (ADR 0005, section 5, under the ADR 0006 names).
-- A selection says only that a contender exists in a Circuit category; it
-- carries no ownership and is shared by every league of the Circuit.
-- Identity is TMDB-based: (category, film) for FILM categories and
-- (category, film, person) for ACTING ones. Rows are never updated.

CREATE TABLE public.circuit_selection (
  id bigserial PRIMARY KEY,
  circuit_category_id bigint NOT NULL
    REFERENCES public.circuit_category(id) ON DELETE CASCADE,
  film_tmdb_id integer NOT NULL,
  person_tmdb_id integer NULL,
  film_id bigint NOT NULL REFERENCES public.film(id),
  person_id bigint NULL REFERENCES public.person(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_selection_identity_key
    UNIQUE NULLS NOT DISTINCT (circuit_category_id, film_tmdb_id, person_tmdb_id),
  CONSTRAINT circuit_selection_person_pair_check
    CHECK ((person_tmdb_id IS NULL) = (person_id IS NULL))
);

CREATE INDEX circuit_selection_film_tmdb_id_idx
  ON public.circuit_selection (film_tmdb_id);

-- FILM categories take no person; ACTING categories need one.
CREATE OR REPLACE FUNCTION public.circuit_selection_check_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_kind text;
BEGIN
  SELECT kind INTO category_kind
  FROM public.circuit_category
  WHERE id = NEW.circuit_category_id;

  IF category_kind = 'FILM' AND NEW.person_tmdb_id IS NOT NULL THEN
    RAISE EXCEPTION 'circuit_selection: a FILM category selection has no person'
      USING ERRCODE = 'check_violation';
  END IF;
  IF category_kind = 'ACTING' AND NEW.person_tmdb_id IS NULL THEN
    RAISE EXCEPTION 'circuit_selection: an ACTING category selection needs a person'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER circuit_selection_check_kind_before_insert
BEFORE INSERT ON public.circuit_selection
FOR EACH ROW
EXECUTE FUNCTION public.circuit_selection_check_kind();

-- Selections are immutable: changing a contender is a drop and a new pick.
CREATE OR REPLACE FUNCTION public.circuit_selection_forbid_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'circuit_selection rows are immutable'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER circuit_selection_forbid_update_before_update
BEFORE UPDATE ON public.circuit_selection
FOR EACH ROW
EXECUTE FUNCTION public.circuit_selection_forbid_update();
