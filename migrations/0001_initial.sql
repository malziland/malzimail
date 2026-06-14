-- Addresses are kept FOREVER so they can never be re-issued.
-- expires_at controls when the address goes "inactive" for the user
-- (no more inbox access, no more accepting new mail), but the row stays.
CREATE TABLE addresses (
  address    TEXT    PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr      TEXT    NOT NULL,
  from_addr    TEXT    NOT NULL,
  subject      TEXT,
  text_body    TEXT,
  html_body    TEXT,
  raw_size     INTEGER,
  received_at  INTEGER NOT NULL
);

CREATE INDEX idx_messages_to_received
  ON messages (to_addr, received_at DESC);
