-- Add PAUSED status to draft.status check constraint
ALTER TABLE draft DROP CONSTRAINT IF EXISTS draft_status_check;
ALTER TABLE draft
  ADD CONSTRAINT draft_status_check
  CHECK (status IN ('PENDING','IN_PROGRESS','PAUSED','COMPLETED','CANCELLED'));
