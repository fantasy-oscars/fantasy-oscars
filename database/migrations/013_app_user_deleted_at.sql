ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_app_user_deleted_at
ON app_user (deleted_at);
