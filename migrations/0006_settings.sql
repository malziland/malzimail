-- Key/value settings store (foundation for the setup assistant, feature flags
-- and admin-managed configuration). Secret values are stored AES-GCM encrypted.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL
);
