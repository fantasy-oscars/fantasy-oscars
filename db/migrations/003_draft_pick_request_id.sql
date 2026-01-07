-- Add request_id for pick idempotency

ALTER TABLE draft_pick
ADD COLUMN request_id TEXT NULL;

-- Enforce uniqueness per draft when provided
CREATE UNIQUE INDEX idx_draft_pick_request_per_draft
  ON draft_pick (draft_id, request_id)
  WHERE request_id IS NOT NULL;
