-- Add admin role flag to users

ALTER TABLE app_user
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
