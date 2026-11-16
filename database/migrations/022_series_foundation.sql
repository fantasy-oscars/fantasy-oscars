-- Series foundation (ADR 0005, sections 2 and 3).
-- A Series is a season-long competition over a fixed set of five events and
-- eight canonical categories. Ceremonies join a Series through one shared
-- association, and ceremony categories map explicitly to canonical ones.
-- No series_* table references a Season or ceremony-draft table, and no
-- existing table references a series_* table.

-- Scoring occasion dates: whole days, editable at any ceremony status.
ALTER TABLE public.ceremony
  ADD COLUMN IF NOT EXISTS nominations_on date NULL,
  ADD COLUMN IF NOT EXISTS results_on date NULL;

CREATE TABLE public.series (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  opens_on date NULL,
  activated_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT series_code_key UNIQUE (code),
  CONSTRAINT series_status_check
    CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'ARCHIVED'::text])),
  CONSTRAINT series_active_activated_at_check
    CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL)
);

CREATE TABLE public.series_event (
  id bigserial PRIMARY KEY,
  series_id bigint NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_index integer NOT NULL,
  CONSTRAINT series_event_series_code_key UNIQUE (series_id, code),
  -- Target of the composite keys that keep associations inside one Series.
  CONSTRAINT series_event_series_id_id_key UNIQUE (series_id, id),
  CONSTRAINT series_event_code_check
    CHECK (
      code = ANY (
        ARRAY[
          'CRITICS_CHOICE'::text,
          'GOLDEN_GLOBES'::text,
          'GUILDS'::text,
          'BAFTA'::text,
          'OSCARS'::text
        ]
      )
    )
);

CREATE TABLE public.series_category (
  id bigserial PRIMARY KEY,
  series_id bigint NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  sort_index integer NOT NULL,
  CONSTRAINT series_category_series_code_key UNIQUE (series_id, code),
  CONSTRAINT series_category_series_id_id_key UNIQUE (series_id, id),
  CONSTRAINT series_category_code_check
    CHECK (
      code = ANY (
        ARRAY[
          'PICTURE'::text,
          'DIRECTOR'::text,
          'ACTOR'::text,
          'ACTRESS'::text,
          'SUPPORTING_ACTOR'::text,
          'SUPPORTING_ACTRESS'::text,
          'SCREENPLAY'::text,
          'ANIMATED_FEATURE'::text
        ]
      )
    ),
  -- The four acting categories are ACTING; every other category is FILM.
  CONSTRAINT series_category_kind_check
    CHECK (
      kind = CASE
        WHEN code = ANY (
          ARRAY[
            'ACTOR'::text,
            'ACTRESS'::text,
            'SUPPORTING_ACTOR'::text,
            'SUPPORTING_ACTRESS'::text
          ]
        ) THEN 'ACTING'
        ELSE 'FILM'
      END
    )
);

-- The one association shared by Series admin and ceremony admin. A ceremony may
-- belong to more than one Series; ordinary use keeps it to one.
CREATE TABLE public.series_ceremony (
  series_id bigint NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  ceremony_id bigint NOT NULL REFERENCES public.ceremony(id) ON DELETE CASCADE,
  series_event_id bigint NOT NULL,
  CONSTRAINT series_ceremony_pkey PRIMARY KEY (series_id, ceremony_id),
  CONSTRAINT series_ceremony_event_fkey
    FOREIGN KEY (series_id, series_event_id)
    REFERENCES public.series_event(series_id, id) ON DELETE CASCADE
);

CREATE INDEX series_ceremony_ceremony_idx ON public.series_ceremony (ceremony_id);

-- Each ceremony category maps to at most one canonical category per Series.
-- The edition's ceremony must be associated with the Series (service check).
CREATE TABLE public.series_mapping (
  series_id bigint NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  category_edition_id bigint NOT NULL
    REFERENCES public.category_edition(id) ON DELETE CASCADE,
  series_category_id bigint NOT NULL,
  CONSTRAINT series_mapping_pkey PRIMARY KEY (series_id, category_edition_id),
  CONSTRAINT series_mapping_category_fkey
    FOREIGN KEY (series_id, series_category_id)
    REFERENCES public.series_category(series_id, id) ON DELETE CASCADE
);

CREATE INDEX series_mapping_category_edition_idx
  ON public.series_mapping (category_edition_id);
