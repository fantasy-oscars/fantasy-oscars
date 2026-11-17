-- Circuit leagues, settings and membership (ADR 0005, section 4, under the
-- ADR 0006 names). A Circuit competition hangs off an existing league, as a
-- Season does, and keeps its own membership: circuit_league_member never
-- references season_member, and no Season table references these rows.
--
-- Membership and enabled events freeze at initialisation. The database records
-- the transition; the one domain guard (assertCircuitLeagueOpen) refuses the
-- writes.

CREATE TABLE public.circuit_league (
  id bigserial PRIMARY KEY,
  circuit_id bigint NOT NULL REFERENCES public.circuit(id) ON DELETE CASCADE,
  league_id bigint NOT NULL REFERENCES public.league(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'SETUP',
  roster_size integer NOT NULL DEFAULT 16,
  draft_type text NOT NULL DEFAULT 'SNAKE',
  -- Null or 0 is untimed.
  pick_timer_seconds integer NULL DEFAULT 90,
  auto_draft_enabled boolean NOT NULL DEFAULT true,
  nomination_points integer NOT NULL DEFAULT 1,
  win_bonus_points integer NOT NULL DEFAULT 2,
  initialized_at timestamptz NULL,
  created_by_user_id bigint NOT NULL REFERENCES public.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_league_circuit_league_key UNIQUE (circuit_id, league_id),
  -- Target for the composite keys below, which keep a league's event rows
  -- inside its own Circuit.
  CONSTRAINT circuit_league_circuit_id_id_key UNIQUE (circuit_id, id),
  CONSTRAINT circuit_league_status_check
    CHECK (status IN ('SETUP', 'INITIALIZED', 'DRAFTING', 'IN_SEASON', 'COMPLETE')),
  CONSTRAINT circuit_league_initialized_check
    CHECK ((status = 'SETUP') = (initialized_at IS NULL)),
  CONSTRAINT circuit_league_roster_size_check CHECK (roster_size BETWEEN 1 AND 64),
  CONSTRAINT circuit_league_draft_type_check CHECK (draft_type IN ('SNAKE', 'AUCTION')),
  CONSTRAINT circuit_league_pick_timer_check
    CHECK (pick_timer_seconds IS NULL OR pick_timer_seconds >= 0),
  CONSTRAINT circuit_league_points_check
    CHECK (nomination_points >= 0 AND win_bonus_points >= 0)
);

CREATE INDEX circuit_league_league_idx ON public.circuit_league (league_id);

-- A row means the event is enabled for the league. Every event of the Circuit
-- gets one at creation (ADR 0006, section 4). An event is the unit: a group of
-- several ceremonies is enabled or disabled as one row.
CREATE TABLE public.circuit_league_event (
  circuit_league_id bigint NOT NULL,
  circuit_id bigint NOT NULL,
  circuit_event_id bigint NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  CONSTRAINT circuit_league_event_pkey PRIMARY KEY (circuit_league_id, circuit_event_id),
  CONSTRAINT circuit_league_event_league_fkey
    FOREIGN KEY (circuit_id, circuit_league_id)
    REFERENCES public.circuit_league(circuit_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_league_event_event_fkey
    FOREIGN KEY (circuit_id, circuit_event_id)
    REFERENCES public.circuit_event(circuit_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_league_event_weight_check CHECK (weight > 0)
);

CREATE INDEX circuit_league_event_event_idx
  ON public.circuit_league_event (circuit_event_id);

-- Per-category weight and ownership limit. Null max_owned is unlimited.
-- A category without a row (added to the Circuit after the league was
-- created) reads as weight 1, unlimited.
CREATE TABLE public.circuit_league_category (
  circuit_league_id bigint NOT NULL,
  circuit_id bigint NOT NULL,
  circuit_category_id bigint NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  max_owned integer NULL,
  CONSTRAINT circuit_league_category_pkey
    PRIMARY KEY (circuit_league_id, circuit_category_id),
  CONSTRAINT circuit_league_category_league_fkey
    FOREIGN KEY (circuit_id, circuit_league_id)
    REFERENCES public.circuit_league(circuit_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_league_category_category_fkey
    FOREIGN KEY (circuit_id, circuit_category_id)
    REFERENCES public.circuit_category(circuit_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_league_category_weight_check CHECK (weight > 0),
  CONSTRAINT circuit_league_category_max_owned_check
    CHECK (max_owned IS NULL OR max_owned >= 1)
);

CREATE INDEX circuit_league_category_category_idx
  ON public.circuit_league_category (circuit_category_id);

-- The user must be a league_member of the same league (service check).
-- Waiver priority is assigned later; null until then.
CREATE TABLE public.circuit_league_member (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  waiver_priority integer NULL,
  CONSTRAINT circuit_league_member_user_key UNIQUE (circuit_league_id, user_id),
  CONSTRAINT circuit_league_member_waiver_priority_key
    UNIQUE (circuit_league_id, waiver_priority) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX circuit_league_member_user_idx ON public.circuit_league_member (user_id);
