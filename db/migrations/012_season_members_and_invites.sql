-- MVP-018 FO-030: season membership + season invites

BEGIN;

CREATE TABLE season_member (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES season(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  league_member_id BIGINT NULL REFERENCES league_member(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','CO_OWNER','MEMBER')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);
CREATE INDEX idx_season_member_season ON season_member (season_id);
CREATE INDEX idx_season_member_user ON season_member (user_id);

-- Season invites support placeholder (token-based) and user-targeted (no external token).
CREATE TABLE season_invite (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES season(id) ON DELETE CASCADE,
  intended_user_id BIGINT NULL REFERENCES app_user(id) ON DELETE SET NULL,
  token_hash CHAR(64) NULL, -- SHA-256 hex digest for placeholder invites
  kind TEXT NOT NULL CHECK (kind IN ('PLACEHOLDER','USER_TARGETED')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CLAIMED','REVOKED','DECLINED')),
  label TEXT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES app_user(id),
  claimed_by_user_id BIGINT NULL REFERENCES app_user(id),
  claimed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_season_invite_token UNIQUE (token_hash)
    DEFERRABLE INITIALLY IMMEDIATE
);

-- Only one pending user-targeted invite per user/season.
CREATE UNIQUE INDEX uq_pending_user_invite_per_season
  ON season_invite (season_id, intended_user_id)
  WHERE status = 'PENDING' AND intended_user_id IS NOT NULL AND kind = 'USER_TARGETED';

-- Token hash is required for placeholder invites; forbid it for user-targeted.
ALTER TABLE season_invite
  ADD CONSTRAINT chk_placeholder_token
    CHECK (
      (kind = 'PLACEHOLDER' AND token_hash IS NOT NULL)
      OR (kind = 'USER_TARGETED' AND token_hash IS NULL)
    );

CREATE INDEX idx_season_invite_season ON season_invite (season_id);
CREATE INDEX idx_season_invite_token_hash ON season_invite (token_hash);
CREATE INDEX idx_season_invite_status ON season_invite (status);

-- Touch updated_at on change.
CREATE OR REPLACE FUNCTION touch_season_invite_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_season_invite_updated_at
  BEFORE UPDATE ON season_invite
  FOR EACH ROW
  EXECUTE FUNCTION touch_season_invite_updated_at();

COMMIT;
