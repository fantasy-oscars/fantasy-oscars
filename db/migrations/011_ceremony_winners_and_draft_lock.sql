-- MVP-011 FO-004: ceremony winners table + global draft lock marker

BEGIN;

ALTER TABLE ceremony
  ADD COLUMN draft_locked_at TIMESTAMPTZ NULL;

CREATE TABLE ceremony_winner (
  id BIGSERIAL PRIMARY KEY,
  ceremony_id BIGINT NOT NULL REFERENCES ceremony(id) ON DELETE CASCADE,
  category_edition_id BIGINT NOT NULL REFERENCES category_edition(id) ON DELETE CASCADE,
  nomination_id BIGINT NOT NULL REFERENCES nomination(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one winner per category edition.
CREATE UNIQUE INDEX uniq_ceremony_winner_category ON ceremony_winner (category_edition_id);
CREATE INDEX idx_ceremony_winner_ceremony ON ceremony_winner (ceremony_id);

-- Keep updated_at fresh on updates.
CREATE OR REPLACE FUNCTION touch_ceremony_winner_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_ceremony_winner_updated_at
  BEFORE UPDATE ON ceremony_winner
  FOR EACH ROW
  EXECUTE FUNCTION touch_ceremony_winner_updated_at();

COMMIT;
