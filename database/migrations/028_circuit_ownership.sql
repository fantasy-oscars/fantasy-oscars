-- Circuit ownership history and transactions (ADR 0005, section 7, under the
-- ADR 0006 names).
--
-- Ownership is a set of half-open intervals [acquired_at, released_at) per
-- (league, selection). Rows are never deleted, and the only update closes an
-- open interval once. Every interval boundary points at the one
-- circuit_transaction that made it, and the composite keys below make that
-- transaction's league, member and selection match the interval's.
--
-- The ownership service (services/circuit/circuitOwnership.ts) is the only
-- writer: it locks the member row and checks capacity and category limits.
-- The partial unique index is the last word on exclusivity.

-- Target for the composite keys below, which keep a transaction's member
-- inside its own league.
ALTER TABLE public.circuit_league_member
  ADD CONSTRAINT circuit_league_member_league_id_key UNIQUE (circuit_league_id, id);

CREATE TABLE public.circuit_transaction (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  member_id bigint NOT NULL,
  kind text NOT NULL,
  add_selection_id bigint NULL REFERENCES public.circuit_selection(id),
  drop_selection_id bigint NULL REFERENCES public.circuit_selection(id),
  -- The draft pick (package 06) and waiver claim (package 08) behind the
  -- transaction. Their tables do not exist yet; those packages add the keys.
  draft_pick_id bigint NULL,
  claim_id bigint NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Null for system actions such as auto-draft and waiver processing.
  actor_user_id bigint NULL REFERENCES public.app_user(id),
  CONSTRAINT circuit_transaction_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  -- Targets for the ownership boundary keys.
  CONSTRAINT circuit_transaction_add_key
    UNIQUE (id, circuit_league_id, member_id, add_selection_id),
  CONSTRAINT circuit_transaction_drop_key
    UNIQUE (id, circuit_league_id, member_id, drop_selection_id),
  CONSTRAINT circuit_transaction_kind_check
    CHECK (kind IN ('DRAFT', 'SUPPLEMENTAL', 'WAIVER', 'FREE_AGENT', 'DROP')),
  CONSTRAINT circuit_transaction_add_or_drop_check
    CHECK (add_selection_id IS NOT NULL OR drop_selection_id IS NOT NULL),
  -- A DROP has no add; every other kind adds.
  CONSTRAINT circuit_transaction_drop_kind_check
    CHECK ((kind = 'DROP') = (add_selection_id IS NULL)),
  CONSTRAINT circuit_transaction_distinct_check
    CHECK (add_selection_id IS DISTINCT FROM drop_selection_id),
  CONSTRAINT circuit_transaction_draft_check
    CHECK (
      (kind IN ('DRAFT', 'SUPPLEMENTAL'))
        = (draft_pick_id IS NOT NULL)
      AND (kind NOT IN ('DRAFT', 'SUPPLEMENTAL') OR drop_selection_id IS NULL)
    ),
  CONSTRAINT circuit_transaction_claim_check
    CHECK ((kind = 'WAIVER') = (claim_id IS NOT NULL))
);

CREATE INDEX circuit_transaction_league_idx
  ON public.circuit_transaction (circuit_league_id, occurred_at DESC, id DESC);

CREATE TABLE public.circuit_ownership (
  id bigserial PRIMARY KEY,
  circuit_league_id bigint NOT NULL
    REFERENCES public.circuit_league(id) ON DELETE CASCADE,
  member_id bigint NOT NULL,
  selection_id bigint NOT NULL REFERENCES public.circuit_selection(id),
  acquired_at timestamptz NOT NULL,
  acquired_transaction_id bigint NOT NULL,
  released_at timestamptz NULL,
  released_transaction_id bigint NULL,
  CONSTRAINT circuit_ownership_member_fkey
    FOREIGN KEY (circuit_league_id, member_id)
    REFERENCES public.circuit_league_member(circuit_league_id, id) ON DELETE CASCADE,
  -- The acquiring transaction added this selection for this member.
  CONSTRAINT circuit_ownership_acquired_fkey
    FOREIGN KEY (acquired_transaction_id, circuit_league_id, member_id, selection_id)
    REFERENCES public.circuit_transaction(id, circuit_league_id, member_id, add_selection_id),
  -- The releasing transaction dropped it (checked once released).
  CONSTRAINT circuit_ownership_released_fkey
    FOREIGN KEY (released_transaction_id, circuit_league_id, member_id, selection_id)
    REFERENCES public.circuit_transaction(id, circuit_league_id, member_id, drop_selection_id),
  -- A transaction opens at most one interval and closes at most one.
  CONSTRAINT circuit_ownership_acquired_transaction_key UNIQUE (acquired_transaction_id),
  CONSTRAINT circuit_ownership_released_transaction_key UNIQUE (released_transaction_id),
  CONSTRAINT circuit_ownership_released_pair_check
    CHECK ((released_at IS NULL) = (released_transaction_id IS NULL)),
  CONSTRAINT circuit_ownership_interval_check
    CHECK (released_at IS NULL OR released_at >= acquired_at)
);

-- Exclusive ownership: at most one open interval per (league, selection).
CREATE UNIQUE INDEX circuit_ownership_open_selection_key
  ON public.circuit_ownership (circuit_league_id, selection_id)
  WHERE released_at IS NULL;

CREATE INDEX circuit_ownership_open_member_idx
  ON public.circuit_ownership (circuit_league_id, member_id)
  WHERE released_at IS NULL;

CREATE INDEX circuit_ownership_selection_idx
  ON public.circuit_ownership (circuit_league_id, selection_id, acquired_at);

-- Append-only. A transaction is never changed. An interval changes only by
-- closing it once; nothing else on the row moves.
CREATE OR REPLACE FUNCTION public.circuit_transaction_forbid_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'circuit_transaction rows are append-only'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER circuit_transaction_forbid_update_before_update
BEFORE UPDATE ON public.circuit_transaction
FOR EACH ROW
EXECUTE FUNCTION public.circuit_transaction_forbid_update();

CREATE OR REPLACE FUNCTION public.circuit_ownership_close_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.released_at IS NOT NULL
     OR NEW.released_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.circuit_league_id IS DISTINCT FROM OLD.circuit_league_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.selection_id IS DISTINCT FROM OLD.selection_id
     OR NEW.acquired_at IS DISTINCT FROM OLD.acquired_at
     OR NEW.acquired_transaction_id IS DISTINCT FROM OLD.acquired_transaction_id THEN
    RAISE EXCEPTION 'circuit_ownership rows only change by closing an open interval'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER circuit_ownership_close_only_before_update
BEFORE UPDATE ON public.circuit_ownership
FOR EACH ROW
EXECUTE FUNCTION public.circuit_ownership_close_only();

-- Rows go only with their league (a cascade, which runs from a trigger, so
-- its depth is above 1). A direct DELETE is refused.
CREATE OR REPLACE FUNCTION public.circuit_history_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER circuit_transaction_forbid_delete_before_delete
BEFORE DELETE ON public.circuit_transaction
FOR EACH ROW
EXECUTE FUNCTION public.circuit_history_forbid_delete();

CREATE TRIGGER circuit_ownership_forbid_delete_before_delete
BEFORE DELETE ON public.circuit_ownership
FOR EACH ROW
EXECUTE FUNCTION public.circuit_history_forbid_delete();
