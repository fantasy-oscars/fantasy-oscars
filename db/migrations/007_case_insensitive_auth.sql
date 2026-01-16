-- Normalize handle/email casing and enforce case-insensitive uniqueness

-- Lowercase existing values to match new invariants
UPDATE app_user
SET handle = lower(handle),
    email = lower(email);

-- Enforce case-insensitive uniqueness via functional unique indexes
CREATE UNIQUE INDEX app_user_handle_lower_key ON app_user (lower(handle));
CREATE UNIQUE INDEX app_user_email_lower_key ON app_user (lower(email));
