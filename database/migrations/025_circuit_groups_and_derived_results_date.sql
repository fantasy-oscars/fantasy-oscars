-- Circuit groups and the derived results date (ADR 0007).
--
-- 1. A ceremony's results date is the date of its ceremony datetime
--    (starts_at) in America/Los_Angeles; the separate results_on column goes.
--    A ceremony with a results date but no datetime gets 17:00 Pacific on
--    that date first. Where the two disagree, starts_at wins.
-- 2. circuit_event tells admin-made groups apart from the one-ceremony events
--    created for single ceremonies, and circuit_ceremony orders the
--    ceremonies inside an event.
-- 3. Legacy events without ceremonies (left by migration 022's fixed slate)
--    are removed; categories and mappings are kept.

-- ---------------------------------------------------------------------------
-- Results date: back-fill starts_at, then drop results_on
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, name, results_on,
      (starts_at AT TIME ZONE 'America/Los_Angeles')::date AS starts_on
    FROM public.ceremony
    WHERE results_on IS NOT NULL
      AND (starts_at IS NULL
        OR (starts_at AT TIME ZONE 'America/Los_Angeles')::date <> results_on)
    ORDER BY id
  LOOP
    IF r.starts_on IS NULL THEN
      RAISE NOTICE 'ceremony % (%): starts_at back-filled to % 17:00 Pacific',
        r.id, r.name, r.results_on;
    ELSE
      RAISE NOTICE 'ceremony % (%): results_on % dropped, starts_at date % kept',
        r.id, r.name, r.results_on, r.starts_on;
    END IF;
  END LOOP;
END
$$;

UPDATE public.ceremony
SET starts_at = (results_on + time '17:00') AT TIME ZONE 'America/Los_Angeles'
WHERE results_on IS NOT NULL AND starts_at IS NULL;

ALTER TABLE public.ceremony DROP COLUMN results_on;

-- ---------------------------------------------------------------------------
-- Groups versus single ceremonies
-- ---------------------------------------------------------------------------
-- A group is made by an admin (Add group), may be empty, and is never deleted
-- for being empty. Any other event holds exactly one ceremony and is hidden
-- plumbing that keeps one league configuration key per event (ADR 0006).
ALTER TABLE public.circuit_event
  ADD COLUMN is_group boolean NOT NULL DEFAULT false;

UPDATE public.circuit_event e
SET is_group = true
WHERE (
  SELECT COUNT(*) FROM public.circuit_ceremony cc WHERE cc.circuit_event_id = e.id
) >= 2;

DELETE FROM public.circuit_event e
WHERE NOT e.is_group
  AND NOT EXISTS (
    SELECT 1 FROM public.circuit_ceremony cc WHERE cc.circuit_event_id = e.id
  );

-- Close the gaps the deletions left in the top-level order.
UPDATE public.circuit_event e
SET sort_index = o.position
FROM (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY circuit_id ORDER BY sort_index, id) - 1)::int
      AS position
  FROM public.circuit_event
) o
WHERE o.id = e.id;

-- Ceremony order inside an event; existing ceremonies keep their id order.
ALTER TABLE public.circuit_ceremony
  ADD COLUMN sort_index integer NOT NULL DEFAULT 0;

UPDATE public.circuit_ceremony cc
SET sort_index = o.position
FROM (
  SELECT circuit_id, ceremony_id,
    (ROW_NUMBER() OVER (PARTITION BY circuit_event_id ORDER BY ceremony_id) - 1)::int
      AS position
  FROM public.circuit_ceremony
) o
WHERE o.circuit_id = cc.circuit_id AND o.ceremony_id = cc.ceremony_id;
