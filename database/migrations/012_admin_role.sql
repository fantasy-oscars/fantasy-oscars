-- Introduce explicit admin tiers:
-- - OPERATOR: day-to-day ceremony/content operations
-- - SUPER_ADMIN: elevated privileges (users + destructive/system actions)
--
-- Keep `is_admin` for backward compatibility, but treat it as a coarse "has admin access".

ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS admin_role text;

-- Backfill existing admins as SUPER_ADMIN so no one loses access during rollout.
UPDATE public.app_user
SET admin_role = 'SUPER_ADMIN'
WHERE is_admin = true
  AND admin_role IS NULL;

ALTER TABLE public.app_user
  DROP CONSTRAINT IF EXISTS app_user_admin_role_check;

ALTER TABLE public.app_user
  ADD CONSTRAINT app_user_admin_role_check
  CHECK (admin_role IS NULL OR admin_role IN ('OPERATOR', 'SUPER_ADMIN'));

-- Preserve coarse boolean behavior for old code paths.
UPDATE public.app_user
SET is_admin = (admin_role IS NOT NULL)
WHERE is_admin IS DISTINCT FROM (admin_role IS NOT NULL);
