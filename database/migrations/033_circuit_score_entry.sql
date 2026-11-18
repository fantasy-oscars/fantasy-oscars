-- Circuit scoring ledger (ADR 0005, section 8, under the ADR 0006 names).
--
-- The ledger is derived: every row is the output of the pure scoreOccasion
-- function over ownership history, the official nominations and winners and
-- the league's scoring matrix. The scoring service
-- (services/circuit/circuitScoring.ts) is the only writer. It rebuilds one
-- (league, ceremony, kind) at a time in one transaction, deleting that
-- occasion's rows and inserting the new ones, so the table can be emptied and
-- rebuilt at any time without losing anything.

CREATE TABLE public.circuit_score_entry (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  member_id bigint NOT NULL,
  selection_id bigint NOT NULL
    REFERENCES public.circuit_selection(id) ON DELETE CASCADE,
  ceremony_id bigint NOT NULL REFERENCES public.ceremony(id) ON DELETE CASCADE,
  kind text NOT NULL,
  occasion_date date NOT NULL,
  points numeric(8, 2) NOT NULL,
  -- The ownership interval that held the selection at the occasion's instant.
  ownership_id bigint NOT NULL
    REFERENCES public.circuit_ownership(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_score_entry_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  -- A selection scores at most once per occasion, however many mapped
  -- categories of the ceremony nominate it (ADR 0006, section 5).
  CONSTRAINT circuit_score_entry_occasion_key
    UNIQUE (circuit_league_id, selection_id, ceremony_id, kind),
  CONSTRAINT circuit_score_entry_kind_check CHECK (kind IN ('NOMINATION', 'WIN')),
  CONSTRAINT circuit_score_entry_points_check CHECK (points >= 0)
);

-- A rebuild replaces one occasion's rows; standings sum per member.
CREATE INDEX circuit_score_entry_occasion_idx
  ON public.circuit_score_entry (circuit_league_id, ceremony_id, kind);

CREATE INDEX circuit_score_entry_member_idx
  ON public.circuit_score_entry (circuit_league_id, member_id);
