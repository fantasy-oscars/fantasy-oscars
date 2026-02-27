-- Ensure avatar assignment is random at the database layer for all insert paths.
-- This protects against any code path that omits avatar_key during app_user inserts.

CREATE OR REPLACE FUNCTION public.pick_random_avatar_key() RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT (
    ARRAY[
      'bat',
      'bear',
      'beaver',
      'bird',
      'bison',
      'camel',
      'cat',
      'cow',
      'crocodile',
      'deer',
      'dog',
      'dolphin',
      'donkey',
      'dove',
      'elephant',
      'ewe',
      'flamingo',
      'giraffe',
      'goat',
      'goose',
      'gorilla',
      'hedgehog',
      'horse',
      'kangaroo',
      'koala',
      'leopard',
      'lizard',
      'mammoth',
      'monkey',
      'mouse',
      'orangutan',
      'owl',
      'ox',
      'parrot',
      'peacock',
      'penguin',
      'pig',
      'rabbit',
      'racoon',
      'ram',
      'rat',
      'rhino',
      'rooster',
      'skunk',
      'snake',
      'swan',
      'tiger',
      'turkey',
      'turtle',
      'water_buffalo',
      'whale',
      'zebra'
    ]
  )[1 + floor(random() * 52)::int]::text;
$$;

ALTER TABLE public.app_user
  ALTER COLUMN avatar_key SET DEFAULT public.pick_random_avatar_key();

CREATE OR REPLACE FUNCTION public.app_user_ensure_avatar_key() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.avatar_key IS NULL OR btrim(NEW.avatar_key) = '' THEN
    NEW.avatar_key := public.pick_random_avatar_key();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_user_ensure_avatar_key_before_insert ON public.app_user;

CREATE TRIGGER app_user_ensure_avatar_key_before_insert
BEFORE INSERT ON public.app_user
FOR EACH ROW
EXECUTE FUNCTION public.app_user_ensure_avatar_key();
