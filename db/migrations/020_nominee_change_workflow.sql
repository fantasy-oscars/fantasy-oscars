-- P1-006 FO-P1-004: Nominee change workflow (internal/external × consequential/benign)

ALTER TABLE nomination
  ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED', 'REPLACED')),
  ADD COLUMN replaced_by_nomination_id BIGINT NULL REFERENCES nomination(id);

CREATE TABLE nomination_change_audit (
  id BIGSERIAL PRIMARY KEY,
  nomination_id BIGINT NOT NULL REFERENCES nomination(id),
  replacement_nomination_id BIGINT NULL REFERENCES nomination(id),
  origin TEXT NOT NULL CHECK (origin IN ('INTERNAL', 'EXTERNAL')),
  impact TEXT NOT NULL CHECK (impact IN ('CONSEQUENTIAL', 'BENIGN')),
  action TEXT NOT NULL CHECK (action IN ('REVOKE', 'REPLACE', 'RESTORE')),
  reason TEXT NOT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nomination_change_nomination ON nomination_change_audit (nomination_id);
CREATE INDEX idx_nomination_status ON nomination (status);
