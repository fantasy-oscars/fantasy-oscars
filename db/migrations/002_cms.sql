-- CMS v1: static content (live immediately) + dynamic content (draft/published)

CREATE TABLE IF NOT EXISTS public.cms_static_content (
  key text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id bigint
);

ALTER TABLE public.cms_static_content
  ADD CONSTRAINT cms_static_content_updated_by_fk
  FOREIGN KEY (updated_by_user_id) REFERENCES public.app_user(id);

CREATE TABLE IF NOT EXISTS public.cms_dynamic_content (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  title text NOT NULL DEFAULT '',
  body_markdown text NOT NULL DEFAULT '',
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_by_user_id bigint,
  updated_by_user_id bigint,
  published_by_user_id bigint,
  CONSTRAINT cms_dynamic_content_status_check CHECK (status IN ('DRAFT', 'PUBLISHED'))
);

ALTER TABLE public.cms_dynamic_content
  ADD CONSTRAINT cms_dynamic_content_created_by_fk
  FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);

ALTER TABLE public.cms_dynamic_content
  ADD CONSTRAINT cms_dynamic_content_updated_by_fk
  FOREIGN KEY (updated_by_user_id) REFERENCES public.app_user(id);

ALTER TABLE public.cms_dynamic_content
  ADD CONSTRAINT cms_dynamic_content_published_by_fk
  FOREIGN KEY (published_by_user_id) REFERENCES public.app_user(id);

CREATE INDEX IF NOT EXISTS cms_dynamic_content_key_status_idx
  ON public.cms_dynamic_content (key, status);

CREATE INDEX IF NOT EXISTS cms_dynamic_content_key_created_at_idx
  ON public.cms_dynamic_content (key, created_at DESC);

-- One published row per key. Publishing will also enforce this in application logic.
CREATE UNIQUE INDEX IF NOT EXISTS cms_dynamic_content_one_published_per_key
  ON public.cms_dynamic_content (key)
  WHERE status = 'PUBLISHED';

-- Seed baseline copy for dogfooding so pages render before the admin edits anything.
INSERT INTO public.cms_static_content (key, title, body_markdown)
VALUES
  ('about', 'About', $$Fantasy Oscars is a lightweight draft game for awards season.

Create a league, invite friends, draft nominees, and follow standings as winners are set.$$),
  ('faq', 'FAQ', $$## What is this?

Fantasy Oscars is a fan-made game where you draft Oscar nominees and score points as winners are announced.

## Do I need an account?

Yes. Accounts are used to join leagues and participate in drafts.$$),
  ('landing_blurb', 'Fantasy Oscars', $$Draft night, but for awards.

Create a league, draft nominees, and watch standings update as winners are announced.$$),
  ('legal_terms', 'Terms', $$MVP terms: use at your own risk during dogfooding; features and data may change.$$),
  ('legal_privacy', 'Privacy', $$MVP policy: we store account and league data to run the game. We do not sell personal information.$$)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.cms_dynamic_content (key, title, body_markdown, status, published_at)
SELECT
  'home_main',
  'Dogfooding Notes: What We''re Testing This Week',
  $$This is the current announcement space.

- Focus areas right now: registration/login flows, league + season creation, and draft room stability under refresh/reconnect.
- If something feels confusing, write down what you expected to happen and what actually happened, then include the URL and timestamp.$$,
  'PUBLISHED',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.cms_dynamic_content WHERE key = 'home_main' AND status = 'PUBLISHED'
);
