-- Admin audit log for sensitive actions

CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NOT NULL REFERENCES app_user(id),
  action TEXT NOT NULL,
  target_type TEXT NULL,
  target_id BIGINT NULL,
  meta JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
