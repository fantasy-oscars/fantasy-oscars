-- Nomination contributor display overrides for gimmick/entity styling:
-- - display_name_override: custom label shown in cards/pills
-- - display_role_override: custom "as ..." text
-- - avatar_person_id_override: source person used for profile image rendering

ALTER TABLE public.nomination_contributor
  ADD COLUMN IF NOT EXISTS display_name_override text,
  ADD COLUMN IF NOT EXISTS display_role_override text,
  ADD COLUMN IF NOT EXISTS avatar_person_id_override bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nomination_contributor_avatar_person_id_override_fkey'
  ) THEN
    ALTER TABLE public.nomination_contributor
      ADD CONSTRAINT nomination_contributor_avatar_person_id_override_fkey
      FOREIGN KEY (avatar_person_id_override)
      REFERENCES public.person(id)
      ON DELETE SET NULL;
  END IF;
END $$;
