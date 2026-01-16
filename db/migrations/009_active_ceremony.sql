-- Single-row app config with active ceremony

CREATE TABLE app_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  active_ceremony_id BIGINT NULL REFERENCES ceremony(id)
);

INSERT INTO app_config (id, active_ceremony_id) VALUES (TRUE, NULL)
ON CONFLICT (id) DO NOTHING;
