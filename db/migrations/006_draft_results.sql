CREATE TABLE draft_result (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL REFERENCES draft(id) ON DELETE CASCADE,
  nomination_id BIGINT NOT NULL REFERENCES nomination(id),
  won BOOLEAN NOT NULL,
  points INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, nomination_id)
);

CREATE INDEX idx_draft_result_draft ON draft_result (draft_id);
CREATE INDEX idx_draft_result_nomination ON draft_result (nomination_id);
