-- Core fantasy oscars schema (test baseline)

-- Icons
CREATE TABLE icon (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  asset_path TEXT NOT NULL
);

-- People
CREATE TABLE person (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL
);

-- Films
CREATE TABLE film (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  country TEXT NULL
);

-- Songs
CREATE TABLE song (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  film_id BIGINT NOT NULL REFERENCES film(id)
);

-- Performances
CREATE TABLE performance (
  id BIGSERIAL PRIMARY KEY,
  film_id BIGINT NOT NULL REFERENCES film(id),
  person_id BIGINT NOT NULL REFERENCES person(id),
  UNIQUE (film_id, person_id)
);

-- Ceremony (yearly)
CREATE TABLE ceremony (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  year INT NOT NULL
);

-- Category family
CREATE TABLE category_family (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon_id BIGINT NOT NULL REFERENCES icon(id),
  default_unit_kind TEXT NOT NULL CHECK (default_unit_kind IN ('FILM','SONG','PERFORMANCE'))
);

-- Category edition (per ceremony)
CREATE TABLE category_edition (
  id BIGSERIAL PRIMARY KEY,
  ceremony_id BIGINT NOT NULL REFERENCES ceremony(id),
  family_id BIGINT NOT NULL REFERENCES category_family(id),
  unit_kind TEXT NOT NULL CHECK (unit_kind IN ('FILM','SONG','PERFORMANCE')),
  icon_id BIGINT NULL REFERENCES icon(id),
  sort_index INT NOT NULL DEFAULT 0,
  UNIQUE (ceremony_id, family_id)
);

-- Nomination
CREATE TABLE nomination (
  id BIGSERIAL PRIMARY KEY,
  category_edition_id BIGINT NOT NULL REFERENCES category_edition(id),
  film_id BIGINT NULL REFERENCES film(id),
  song_id BIGINT NULL REFERENCES song(id),
  performance_id BIGINT NULL REFERENCES performance(id),
  CONSTRAINT chk_nomination_single_subject CHECK (
    (film_id IS NOT NULL)::int +
    (song_id IS NOT NULL)::int +
    (performance_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_nomination_category ON nomination (category_edition_id);

-- Nomination contributor
CREATE TABLE nomination_contributor (
  id BIGSERIAL PRIMARY KEY,
  nomination_id BIGINT NOT NULL REFERENCES nomination(id),
  person_id BIGINT NOT NULL REFERENCES person(id),
  role_label TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_nomination_contributor_nomination ON nomination_contributor (nomination_id);

-- App users
CREATE TABLE app_user (
  id BIGSERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth password (placeholder)
CREATE TABLE auth_password (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  password_set_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leagues
CREATE TABLE league (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  ceremony_id BIGINT NOT NULL REFERENCES ceremony(id),
  max_members INT NOT NULL,
  roster_size INT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id BIGINT NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- League members
CREATE TABLE league_member (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id),
  role TEXT NOT NULL CHECK (role IN ('OWNER','CO_OWNER','MEMBER')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX idx_league_member_league ON league_member (league_id);
CREATE INDEX idx_league_member_user ON league_member (user_id);

-- Draft
CREATE TABLE draft (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  draft_order_type TEXT NOT NULL CHECK (draft_order_type IN ('SNAKE','LINEAR')),
  current_pick_number INT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  UNIQUE (league_id)
);

-- Draft seats
CREATE TABLE draft_seat (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL REFERENCES draft(id) ON DELETE CASCADE,
  league_member_id BIGINT NOT NULL REFERENCES league_member(id),
  seat_number INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (draft_id, seat_number),
  UNIQUE (draft_id, league_member_id)
);

CREATE INDEX idx_draft_seat_draft ON draft_seat (draft_id);

-- Draft picks
CREATE TABLE draft_pick (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL REFERENCES draft(id) ON DELETE CASCADE,
  pick_number INT NOT NULL,
  round_number INT NOT NULL,
  seat_number INT NOT NULL,
  league_member_id BIGINT NOT NULL REFERENCES league_member(id),
  nomination_id BIGINT NOT NULL REFERENCES nomination(id),
  made_at TIMESTAMPTZ NULL,
  UNIQUE (draft_id, pick_number),
  UNIQUE (draft_id, nomination_id),
  UNIQUE (draft_id, round_number, seat_number)
);

CREATE INDEX idx_draft_pick_draft ON draft_pick (draft_id);
CREATE INDEX idx_draft_pick_member ON draft_pick (league_member_id);
CREATE INDEX idx_draft_pick_nomination ON draft_pick (nomination_id);
