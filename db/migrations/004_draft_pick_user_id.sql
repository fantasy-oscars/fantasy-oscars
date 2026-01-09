ALTER TABLE draft_pick
  ADD COLUMN user_id BIGINT;

UPDATE draft_pick dp
SET user_id = lm.user_id
FROM league_member lm
WHERE dp.league_member_id = lm.id;

ALTER TABLE draft_pick
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE draft_pick
  ADD CONSTRAINT draft_pick_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_user(id);

CREATE INDEX idx_draft_pick_user ON draft_pick (user_id);
