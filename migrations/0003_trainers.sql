-- Trainer accounts with rate limits and time-based activation.
-- secret_hash is SHA-256 of the cleartext secret; cleartext is never stored.
-- active_until is the unix timestamp (ms) when the trainer's "workshop window" expires.
CREATE TABLE trainers (
  token             TEXT    PRIMARY KEY,
  name              TEXT    NOT NULL,
  secret_hash       TEXT    NOT NULL,
  daily_used_limit  INTEGER,
  daily_gen_limit   INTEGER,
  active_until      INTEGER NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  notes             TEXT
);

-- Link addresses to the trainer who issued them, so we can enforce per-trainer
-- limits and produce per-trainer statistics.
ALTER TABLE addresses ADD COLUMN trainer_token TEXT;
CREATE INDEX idx_addr_trainer_created ON addresses (trainer_token, created_at);
CREATE INDEX idx_addr_trainer_firstmail ON addresses (trainer_token, first_mail_at);
