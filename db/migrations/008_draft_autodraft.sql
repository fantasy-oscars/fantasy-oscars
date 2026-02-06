-- Per-user auto-draft preferences for a specific draft.
-- Stored on the server so the draft timer can auto-pick authoritatively.

CREATE TABLE public.draft_autodraft (
    id bigint NOT NULL,
    draft_id bigint NOT NULL,
    user_id bigint NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    strategy text DEFAULT 'RANDOM'::text NOT NULL,
    plan_id bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT draft_autodraft_strategy_check CHECK ((strategy = ANY (ARRAY['RANDOM'::text, 'PLAN'::text])))
);

CREATE SEQUENCE public.draft_autodraft_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.draft_autodraft_id_seq OWNED BY public.draft_autodraft.id;

ALTER TABLE ONLY public.draft_autodraft
    ALTER COLUMN id SET DEFAULT nextval('public.draft_autodraft_id_seq'::regclass);

ALTER TABLE ONLY public.draft_autodraft
    ADD CONSTRAINT draft_autodraft_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.draft_autodraft
    ADD CONSTRAINT draft_autodraft_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.draft(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.draft_autodraft
    ADD CONSTRAINT draft_autodraft_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.draft_autodraft
    ADD CONSTRAINT draft_autodraft_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.draft_plan(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX draft_autodraft_unique_idx
    ON public.draft_autodraft (draft_id, user_id);

