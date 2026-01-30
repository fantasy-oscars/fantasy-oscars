-- Allow multiple winners per category (ties).
-- Replace the unique constraint on (category_edition_id) with a unique pair constraint
-- on (category_edition_id, nomination_id).

-- NOTE: Some environments may predate the winners feature but still run with
-- MIGRATIONS_BOOTSTRAP_EXISTING enabled. In that mode, 001_init.sql can be
-- marked "applied" even if its changes were rolled back due to an early
-- duplicate-object error. This guard makes the winners schema self-healing.
DO $$
BEGIN
  IF to_regclass('public.ceremony_winner') IS NULL THEN
    CREATE OR REPLACE FUNCTION public.touch_ceremony_winner_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

    CREATE TABLE public.ceremony_winner (
      id bigserial PRIMARY KEY,
      ceremony_id bigint NOT NULL,
      category_edition_id bigint NOT NULL,
      nomination_id bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ceremony_winner_ceremony_id_fkey'
        AND conrelid = 'public.ceremony_winner'::regclass
    ) THEN
      ALTER TABLE ONLY public.ceremony_winner
        ADD CONSTRAINT ceremony_winner_ceremony_id_fkey
        FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ceremony_winner_category_edition_id_fkey'
        AND conrelid = 'public.ceremony_winner'::regclass
    ) THEN
      ALTER TABLE ONLY public.ceremony_winner
        ADD CONSTRAINT ceremony_winner_category_edition_id_fkey
        FOREIGN KEY (category_edition_id) REFERENCES public.category_edition(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ceremony_winner_nomination_id_fkey'
        AND conrelid = 'public.ceremony_winner'::regclass
    ) THEN
      ALTER TABLE ONLY public.ceremony_winner
        ADD CONSTRAINT ceremony_winner_nomination_id_fkey
        FOREIGN KEY (nomination_id) REFERENCES public.nomination(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_ceremony_winner_updated_at'
        AND tgrelid = 'public.ceremony_winner'::regclass
    ) THEN
      CREATE TRIGGER trg_touch_ceremony_winner_updated_at
        BEFORE UPDATE ON public.ceremony_winner
        FOR EACH ROW EXECUTE FUNCTION public.touch_ceremony_winner_updated_at();
    END IF;

    CREATE INDEX IF NOT EXISTS idx_ceremony_winner_ceremony
      ON public.ceremony_winner USING btree (ceremony_id);
  END IF;
END $$;

DROP INDEX IF EXISTS public.uniq_ceremony_winner_category;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ceremony_winner_category_nomination
  ON public.ceremony_winner (category_edition_id, nomination_id);
