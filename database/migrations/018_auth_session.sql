-- Server-side login sessions. Each issued auth token carries the session id as
-- its `sid` claim; a token is only accepted while its session row is present,
-- not revoked and not expired.

CREATE TABLE IF NOT EXISTS public.auth_session (
  id text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id
  ON public.auth_session (user_id);
