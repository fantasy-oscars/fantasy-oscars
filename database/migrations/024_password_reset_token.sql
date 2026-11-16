-- Self-service password reset. Only the SHA-256 of the emailed token is stored;
-- the raw token exists only in the email. Replaces auth_password_reset from the
-- initial schema, which nothing ever wrote to.
DROP TABLE public.auth_password_reset;

CREATE TABLE public.password_reset_token (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);

CREATE INDEX idx_password_reset_token_user ON public.password_reset_token USING btree (user_id);
