ALTER TABLE draft
  ADD COLUMN version INT NOT NULL DEFAULT 0;

CREATE TABLE draft_event (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL REFERENCES draft(id) ON DELETE CASCADE,
  version INT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, version)
);

CREATE INDEX idx_draft_event_draft ON draft_event (draft_id);
CREATE INDEX idx_draft_event_draft_version ON draft_event (draft_id, version);
