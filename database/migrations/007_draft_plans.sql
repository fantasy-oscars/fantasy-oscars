-- Draft plans are per-user and scoped to a ceremony.
-- They store an ordered list of nomination ids for auto-draft planning.

CREATE TABLE public.draft_plan (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    ceremony_id bigint NOT NULL,
    name text NOT NULL,
    name_normalized text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.draft_plan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.draft_plan_id_seq OWNED BY public.draft_plan.id;

ALTER TABLE ONLY public.draft_plan
    ALTER COLUMN id SET DEFAULT nextval('public.draft_plan_id_seq'::regclass);

ALTER TABLE ONLY public.draft_plan
    ADD CONSTRAINT draft_plan_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.draft_plan
    ADD CONSTRAINT draft_plan_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.draft_plan
    ADD CONSTRAINT draft_plan_ceremony_id_fkey FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX draft_plan_user_ceremony_name_norm_idx
    ON public.draft_plan (user_id, ceremony_id, name_normalized);

CREATE TABLE public.draft_plan_item (
    id bigint NOT NULL,
    plan_id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    sort_index integer NOT NULL
);

CREATE SEQUENCE public.draft_plan_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.draft_plan_item_id_seq OWNED BY public.draft_plan_item.id;

ALTER TABLE ONLY public.draft_plan_item
    ALTER COLUMN id SET DEFAULT nextval('public.draft_plan_item_id_seq'::regclass);

ALTER TABLE ONLY public.draft_plan_item
    ADD CONSTRAINT draft_plan_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.draft_plan_item
    ADD CONSTRAINT draft_plan_item_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.draft_plan(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.draft_plan_item
    ADD CONSTRAINT draft_plan_item_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX draft_plan_item_unique_idx
    ON public.draft_plan_item (plan_id, nomination_id);

CREATE INDEX draft_plan_item_plan_sort_idx
    ON public.draft_plan_item (plan_id, sort_index);

