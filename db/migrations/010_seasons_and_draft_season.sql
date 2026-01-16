-- Introduce seasons table and migrate drafts to season_id

CREATE TABLE season (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  ceremony_id BIGINT NOT NULL REFERENCES ceremony(id),
  status TEXT NOT NULL DEFAULT 'EXTANT' CHECK (status IN ('EXTANT', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one EXTANT season per (league, ceremony)
CREATE UNIQUE INDEX uniq_season_extant_league_ceremony
  ON season (league_id, ceremony_id)
  WHERE status = 'EXTANT';

-- Allow multiple seasons per league overall
CREATE INDEX idx_season_league ON season (league_id);

-- Draft now points to season
ALTER TABLE draft
  ADD COLUMN season_id BIGINT NULL REFERENCES season(id) ON DELETE CASCADE;

-- Backfill: one extant season per league using the league's ceremony
INSERT INTO season (league_id, ceremony_id, status)
SELECT id, ceremony_id, 'EXTANT'
FROM league
ON CONFLICT (league_id, ceremony_id) WHERE status = 'EXTANT' DO NOTHING;

-- Attach drafts to their league's extant season
UPDATE draft d
SET season_id = s.id
FROM season s
WHERE d.league_id = s.league_id
  AND s.status = 'EXTANT'
  AND s.ceremony_id = (SELECT ceremony_id FROM league l WHERE l.id = d.league_id);

-- Enforce required season_id and one draft per season
ALTER TABLE draft
  ALTER COLUMN season_id SET NOT NULL;

-- Drop legacy unique constraint on league_id to allow multiple drafts across seasons
ALTER TABLE draft DROP CONSTRAINT IF EXISTS draft_league_id_key;

CREATE UNIQUE INDEX uniq_draft_season ON draft (season_id);

-- Keep league_id for now (compatibility) but future code paths should rely on season_id.
