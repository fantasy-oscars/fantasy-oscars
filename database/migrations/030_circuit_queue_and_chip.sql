-- Circuit draft queue and chips (ADR 0005, sections 6 and 9, under the
-- ADR 0006 names).
--
-- One queue per member: the member's crib sheet and the only source of an
-- auto-pick. It is read live at each auto-pick and editable throughout the
-- draft. A pick never removes a queue row; unavailable rows are skipped.

CREATE TABLE public.circuit_queue_item (
  member_id bigint NOT NULL
    REFERENCES public.circuit_league_member(id) ON DELETE CASCADE,
  selection_id bigint NOT NULL
    REFERENCES public.circuit_selection(id) ON DELETE CASCADE,
  -- 1 is the top of the queue.
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_queue_item_pkey PRIMARY KEY (member_id, selection_id),
  -- Deferred, so a reorder can rewrite every position in one transaction.
  CONSTRAINT circuit_queue_item_position_key UNIQUE (member_id, position)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT circuit_queue_item_position_check CHECK (position >= 1)
);

-- A chip comes from a supplemental pick that was missed again. Its value is
-- the original pick number (lower is better), unique per league. Package 08
-- adds claims, consumption and expiry, and the key on consumed_claim_id.
CREATE TABLE public.circuit_chip (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  member_id bigint NOT NULL,
  original_pick_number integer NOT NULL,
  status text NOT NULL DEFAULT 'AVAILABLE',
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_claim_id bigint NULL,
  expired_at timestamptz NULL,
  CONSTRAINT circuit_chip_pick_key UNIQUE (circuit_league_id, original_pick_number),
  CONSTRAINT circuit_chip_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_chip_status_check
    CHECK (status IN ('AVAILABLE', 'CONSUMED', 'EXPIRED')),
  CONSTRAINT circuit_chip_pick_number_check CHECK (original_pick_number >= 1),
  CONSTRAINT circuit_chip_consumed_check
    CHECK ((status = 'CONSUMED') = (consumed_claim_id IS NOT NULL)),
  CONSTRAINT circuit_chip_expired_check CHECK ((status = 'EXPIRED') = (expired_at IS NOT NULL))
);

CREATE INDEX circuit_chip_member_idx ON public.circuit_chip (member_id);
