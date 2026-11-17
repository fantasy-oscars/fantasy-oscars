-- Circuit draft (ADR 0005, section 6, under the ADR 0006 names). A separate
-- table family from the ceremony draft: no key in either direction, and the
-- ceremony draft's tables are unchanged.
--
-- A league has at most one draft. Seats hold the league's members in a
-- uniformly shuffled order; picks follow the snake order over those seats.
-- A pick is history; ownership (migration 028) is the state, and each PICKED
-- row has exactly one DRAFT or SUPPLEMENTAL circuit_transaction.

CREATE TABLE public.circuit_draft (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  draft_type text NOT NULL DEFAULT 'SNAKE',
  rounds integer NOT NULL,
  -- 0 is untimed.
  pick_timer_seconds integer NOT NULL DEFAULT 90,
  current_pick_number integer NULL,
  pick_deadline_at timestamptz NULL,
  version integer NOT NULL DEFAULT 0,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  paused_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_draft_league_key UNIQUE (circuit_league_id),
  -- Target for the composite key from circuit_draft_seat.
  CONSTRAINT circuit_draft_id_league_key UNIQUE (id, circuit_league_id),
  CONSTRAINT circuit_draft_status_check
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'PAUSED', 'SUPPLEMENTAL', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT circuit_draft_type_check CHECK (draft_type IN ('SNAKE', 'AUCTION')),
  CONSTRAINT circuit_draft_rounds_check CHECK (rounds >= 1),
  CONSTRAINT circuit_draft_pick_timer_check CHECK (pick_timer_seconds >= 0),
  CONSTRAINT circuit_draft_current_pick_check
    CHECK (current_pick_number IS NULL OR current_pick_number >= 1),
  CONSTRAINT circuit_draft_version_check CHECK (version >= 0),
  CONSTRAINT circuit_draft_paused_check CHECK ((status = 'PAUSED') = (paused_at IS NOT NULL)),
  CONSTRAINT circuit_draft_completed_check
    CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

-- Seat numbers start at 1. The member belongs to the draft's league.
CREATE TABLE public.circuit_draft_seat (
  draft_id bigint NOT NULL,
  circuit_league_id bigint NOT NULL,
  seat_number integer NOT NULL,
  member_id bigint NOT NULL,
  CONSTRAINT circuit_draft_seat_pkey PRIMARY KEY (draft_id, seat_number),
  CONSTRAINT circuit_draft_seat_member_key UNIQUE (draft_id, member_id),
  -- Target for the composite key from circuit_draft_pick.
  CONSTRAINT circuit_draft_seat_pick_key UNIQUE (draft_id, seat_number, member_id),
  CONSTRAINT circuit_draft_seat_draft_fkey
    FOREIGN KEY (draft_id, circuit_league_id)
    REFERENCES public.circuit_draft(id, circuit_league_id) ON DELETE CASCADE,
  CONSTRAINT circuit_draft_seat_league_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_draft_seat_number_check CHECK (seat_number >= 1)
);

-- One row per pick slot that has been resolved. A MISSED row keeps its
-- original_pick_number; its supplemental pick carries the same number at a
-- later pick_number, at most once.
CREATE TABLE public.circuit_draft_pick (
  id bigserial PRIMARY KEY,
  draft_id bigint NOT NULL REFERENCES public.circuit_draft(id) ON DELETE CASCADE,
  pick_number integer NOT NULL,
  original_pick_number integer NOT NULL,
  seat_number integer NOT NULL,
  member_id bigint NOT NULL,
  outcome text NOT NULL,
  selection_id bigint NULL REFERENCES public.circuit_selection(id),
  source text NOT NULL,
  request_id text NULL,
  -- Null for system actions such as auto-draft.
  actor_user_id bigint NULL REFERENCES public.app_user(id),
  made_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_draft_pick_number_key UNIQUE (draft_id, pick_number),
  -- A selection is drafted at most once per draft.
  CONSTRAINT circuit_draft_pick_selection_key UNIQUE (draft_id, selection_id),
  CONSTRAINT circuit_draft_pick_request_key UNIQUE (draft_id, member_id, request_id),
  -- Target for the composite key from circuit_transaction.
  CONSTRAINT circuit_draft_pick_transaction_key UNIQUE (id, member_id, selection_id),
  CONSTRAINT circuit_draft_pick_seat_fkey
    FOREIGN KEY (draft_id, seat_number, member_id)
    REFERENCES public.circuit_draft_seat(draft_id, seat_number, member_id)
    ON DELETE CASCADE,
  CONSTRAINT circuit_draft_pick_numbers_check
    CHECK (original_pick_number >= 1 AND original_pick_number <= pick_number),
  CONSTRAINT circuit_draft_pick_outcome_check CHECK (outcome IN ('PICKED', 'MISSED')),
  CONSTRAINT circuit_draft_pick_selection_check
    CHECK ((outcome = 'PICKED') = (selection_id IS NOT NULL)),
  CONSTRAINT circuit_draft_pick_source_check CHECK (source IN ('MANUAL', 'AUTO')),
  -- A manual pick carries the client's request id, which makes it idempotent.
  CONSTRAINT circuit_draft_pick_request_check
    CHECK ((source = 'MANUAL') = (request_id IS NOT NULL))
);

-- One supplemental pick per missed pick.
CREATE UNIQUE INDEX circuit_draft_pick_supplemental_key
  ON public.circuit_draft_pick (draft_id, original_pick_number)
  WHERE pick_number <> original_pick_number;

-- Versioned per draft, for realtime delivery and reconnect.
CREATE TABLE public.circuit_draft_event (
  id bigserial PRIMARY KEY,
  draft_id bigint NOT NULL REFERENCES public.circuit_draft(id) ON DELETE CASCADE,
  version integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_draft_event_version_key UNIQUE (draft_id, version)
);

-- The draft pick behind a DRAFT or SUPPLEMENTAL transaction (migration 028
-- left the key to this package). The transaction's member and added
-- selection are the pick's, and a pick has at most one transaction.
ALTER TABLE public.circuit_transaction
  ADD CONSTRAINT circuit_transaction_draft_pick_fkey
    FOREIGN KEY (draft_pick_id, member_id, add_selection_id)
    REFERENCES public.circuit_draft_pick(id, member_id, selection_id),
  ADD CONSTRAINT circuit_transaction_draft_pick_key UNIQUE (draft_pick_id);
