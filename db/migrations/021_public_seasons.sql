-- Public seasons: ad-hoc, open-join seasons without user-managed leagues

ALTER TABLE league
  ADD COLUMN is_public_season BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one public season container per ceremony (extant season enforced elsewhere)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_public_season_per_ceremony
  ON league (ceremony_id)
  WHERE is_public_season = TRUE;
