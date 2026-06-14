-- Optional Google account integration.
-- Per trainer: switch to also provision a Google login for each participant.
-- Per address: the created Google login + its encrypted password.
ALTER TABLE trainers  ADD COLUMN google_enabled       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE addresses ADD COLUMN google_login         TEXT;
ALTER TABLE addresses ADD COLUMN google_password_enc  TEXT;
