-- Expand per-user auto-draft strategy options and add cached ceremony-level
-- wisdom-of-crowds benchmarks (fit from completed drafts only).

ALTER TABLE public.draft_autodraft
  DROP CONSTRAINT IF EXISTS draft_autodraft_strategy_check;

ALTER TABLE public.draft_autodraft
  ADD CONSTRAINT draft_autodraft_strategy_check
  CHECK (
    strategy = ANY (
      ARRAY[
        'RANDOM'::text,
        'PLAN'::text,
        'BY_CATEGORY'::text,
        'ALPHABETICAL'::text,
        'WISDOM'::text
      ]
    )
  );

CREATE TABLE public.ceremony_wisdom_benchmark (
    ceremony_id bigint NOT NULL,
    version bigint NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ceremony_wisdom_benchmark_pkey PRIMARY KEY (ceremony_id),
    CONSTRAINT ceremony_wisdom_benchmark_ceremony_id_fkey
      FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id) ON DELETE CASCADE
);

CREATE TABLE public.ceremony_wisdom_benchmark_item (
    ceremony_id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    score double precision NOT NULL,
    rank integer NOT NULL,
    sample_size integer NOT NULL,
    CONSTRAINT ceremony_wisdom_benchmark_item_pkey PRIMARY KEY (ceremony_id, nomination_id),
    CONSTRAINT ceremony_wisdom_benchmark_item_ceremony_id_fkey
      FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id) ON DELETE CASCADE,
    CONSTRAINT ceremony_wisdom_benchmark_item_nomination_id_fkey
      FOREIGN KEY (nomination_id) REFERENCES public.nomination(id) ON DELETE CASCADE
);

CREATE INDEX ceremony_wisdom_benchmark_item_ceremony_idx
  ON public.ceremony_wisdom_benchmark_item (ceremony_id);

