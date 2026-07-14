-- easyTodoKanban schema + Main project seed
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  position   REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE columns (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   REAL NOT NULL
);

CREATE TABLE cards (
  id          INTEGER PRIMARY KEY,
  column_id   INTEGER NOT NULL REFERENCES columns(id),
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL DEFAULT '',
  position    REAL NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_columns_project ON columns(project_id, position);
CREATE INDEX idx_cards_column ON cards(column_id, position)
  WHERE archived_at IS NULL;

-- Seed default project Main with Todo / Doing / Done
INSERT INTO projects (name, slug, is_default, position) VALUES ('Main', 'main', 1, 1.0);
INSERT INTO columns (project_id, name, position)
  SELECT id, 'Todo', 1.0 FROM projects WHERE slug = 'main';
INSERT INTO columns (project_id, name, position)
  SELECT id, 'Doing', 2.0 FROM projects WHERE slug = 'main';
INSERT INTO columns (project_id, name, position)
  SELECT id, 'Done', 3.0 FROM projects WHERE slug = 'main';
