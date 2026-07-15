-- Keep image bytes in R2; D1 stores only lightweight attachment metadata.
CREATE TABLE card_attachments (
  id           TEXT PRIMARY KEY,
  card_id      INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  object_key   TEXT NOT NULL UNIQUE,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_card_attachments_card
  ON card_attachments(card_id, created_at, id);
