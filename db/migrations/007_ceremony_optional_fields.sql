-- Allow creating a blank ceremony record and completing details in the Init step.
-- We still treat code/name as required before publish, but they can be NULL while DRAFT.

ALTER TABLE public.ceremony
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN year DROP NOT NULL;

