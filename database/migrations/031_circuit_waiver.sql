-- Circuit waiver runs and claims (ADR 0005, section 9, under the ADR 0006
-- names). Migration 030 added the chip's consumption and expiry columns;
-- this one adds the keys that tie them, and WAIVER transactions, to claims.
--
-- A claim is keyed to its window by the window's first day; windows are
-- derived, never stored. A run is one (league, window): its unique key makes
-- processing idempotent, and its row is the processor's mark that the
-- window's claims are locked.

CREATE TABLE public.circuit_waiver_run (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  window_starts_on date NOT NULL,
  window_ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  -- Member ids and priorities, before the run and after its one rewrite.
  priority_before jsonb NOT NULL,
  priority_after jsonb NULL,
  CONSTRAINT circuit_waiver_run_window_key UNIQUE (circuit_league_id, window_starts_on),
  -- Target for the claim's composite key, which keeps a claim's run inside
  -- its own league and window.
  CONSTRAINT circuit_waiver_run_claim_target_key
    UNIQUE (circuit_league_id, window_starts_on, id),
  CONSTRAINT circuit_waiver_run_status_check CHECK (status IN ('RUNNING', 'COMPLETED')),
  CONSTRAINT circuit_waiver_run_completed_check
    CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CONSTRAINT circuit_waiver_run_priority_after_check
    CHECK ((status = 'COMPLETED') = (priority_after IS NOT NULL)),
  CONSTRAINT circuit_waiver_run_window_check CHECK (window_ends_on >= window_starts_on)
);

-- Target for the claim's chip key, which keeps a claim's chip the claimant's.
ALTER TABLE public.circuit_chip
  ADD CONSTRAINT circuit_chip_member_id_key UNIQUE (circuit_league_id, member_id, id);

CREATE TABLE public.circuit_waiver_claim (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  member_id bigint NOT NULL,
  window_starts_on date NOT NULL,
  selection_id bigint NOT NULL REFERENCES public.circuit_selection(id),
  -- The conditional drop: dropped only if the claim wins.
  drop_selection_id bigint NULL REFERENCES public.circuit_selection(id),
  chip_id bigint NULL,
  -- The member's own order within the window; 1 is first.
  rank integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  failure_reason text NULL,
  run_id bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_waiver_claim_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  CONSTRAINT circuit_waiver_claim_chip_fkey
    FOREIGN KEY (circuit_league_id, member_id, chip_id)
    REFERENCES public.circuit_chip(circuit_league_id, member_id, id),
  CONSTRAINT circuit_waiver_claim_run_fkey
    FOREIGN KEY (circuit_league_id, window_starts_on, run_id)
    REFERENCES public.circuit_waiver_run(circuit_league_id, window_starts_on, id),
  -- Target for the WAIVER transaction's key.
  CONSTRAINT circuit_waiver_claim_transaction_target_key
    UNIQUE (id, circuit_league_id, member_id, selection_id),
  CONSTRAINT circuit_waiver_claim_status_check
    CHECK (status IN ('PENDING', 'WON', 'LOST', 'WITHDRAWN')),
  CONSTRAINT circuit_waiver_claim_rank_check CHECK (rank >= 1),
  CONSTRAINT circuit_waiver_claim_drop_check CHECK (drop_selection_id <> selection_id),
  -- Only the processor resolves a claim, inside its run.
  CONSTRAINT circuit_waiver_claim_run_check
    CHECK ((status IN ('WON', 'LOST')) = (run_id IS NOT NULL)),
  CONSTRAINT circuit_waiver_claim_failure_check
    CHECK (
      (status = 'LOST') = (failure_reason IS NOT NULL)
      AND (
        failure_reason IS NULL
        OR failure_reason IN ('SELECTION_OWNED', 'DROP_NOT_OWNED', 'ROSTER_FULL', 'CATEGORY_LIMIT')
      )
    )
);

-- One live claim per selection per member and window.
CREATE UNIQUE INDEX circuit_waiver_claim_selection_key
  ON public.circuit_waiver_claim (circuit_league_id, member_id, window_starts_on, selection_id)
  WHERE status <> 'WITHDRAWN';

-- A chip rides on at most one pending claim.
CREATE UNIQUE INDEX circuit_waiver_claim_chip_key
  ON public.circuit_waiver_claim (chip_id)
  WHERE status = 'PENDING' AND chip_id IS NOT NULL;

CREATE INDEX circuit_waiver_claim_window_idx
  ON public.circuit_waiver_claim (circuit_league_id, window_starts_on, status);

-- The claim a chip was consumed by (migration 030 left the key to this
-- package): a winning claim that carried this chip.
ALTER TABLE public.circuit_chip
  ADD CONSTRAINT circuit_chip_consumed_claim_fkey
    FOREIGN KEY (consumed_claim_id) REFERENCES public.circuit_waiver_claim(id),
  ADD CONSTRAINT circuit_chip_consumed_claim_key UNIQUE (consumed_claim_id);

-- The claim behind a WAIVER transaction (migration 028 left the key to this
-- package). The transaction's member and added selection are the claim's,
-- and a claim has at most one transaction.
ALTER TABLE public.circuit_transaction
  ADD CONSTRAINT circuit_transaction_claim_fkey
    FOREIGN KEY (claim_id, circuit_league_id, member_id, add_selection_id)
    REFERENCES public.circuit_waiver_claim(id, circuit_league_id, member_id, selection_id),
  ADD CONSTRAINT circuit_transaction_claim_key UNIQUE (claim_id);
