-- Circuit draft staging (beside the queue of migration 030).
--
-- A member's staged contenders: selections set aside to draft by hand,
-- unranked and never auto-picked. A selection is either queued or staged
-- for a member, never both; moving it between the two is one transaction
-- under the queue lock. Like the queue, a pick never removes a staged row.

CREATE TABLE public.circuit_staged_item (
  member_id bigint NOT NULL
    REFERENCES public.circuit_league_member(id) ON DELETE CASCADE,
  selection_id bigint NOT NULL
    REFERENCES public.circuit_selection(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT circuit_staged_item_pkey PRIMARY KEY (member_id, selection_id)
);
