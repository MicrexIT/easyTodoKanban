# easyTodoKanban — Product Spec

A personal kanban todo app for Michele (Remics) and his AI agents. One human user,
multiple machines, multiple agent processes — all working against a single source
of truth.

## Goals

- Manage todos visually on a kanban board, from desktop and iPhone browsers.
- Let AI agents (Claude Code sessions on Michele's machines) read and manage the
  same boards natively via MCP tools.
- Cost ~$0/month. No servers to maintain.

## Non-goals

- Multi-user accounts, sharing, permissions, comments, assignees.
- Native mobile app (responsive web is the target; PWA install is a nice-to-have).
- Offline-first sync.
- Git/markdown-file storage (explicitly rejected — see CONTEXT.md).

## Core concepts

### Projects
- A project is a board. Multiple projects supported.
- A default project named **Main** is seeded on first migration and cannot be
  deleted (it can be renamed).
- Project switcher in the UI header.

### Columns (dynamic)
- Each project has its own ordered set of columns.
- Users can create, rename, reorder, and delete columns at any time.
- New projects are seeded with `Todo / Doing / Done`.
- Deleting a column requires it to be empty (UI moves cards out first or blocks).

### Cards
- A card belongs to exactly one column, at an ordered position.
- Fields: `title` (plain text, required), `body_md` (markdown, optional),
  timestamps.
- Card body is written and stored as **markdown**, rendered to HTML in the UI
  (client-side, e.g. `marked`). Editing: plain textarea with a preview toggle —
  no heavyweight editor.
- Cards can be dragged within a column (reorder) and across columns (move).
- Cards can be archived (soft delete: `archived_at` timestamp) rather than
  hard-deleted; an "archived" view allows restore or permanent delete.

### Ordering
- `position` is a `REAL`. Insert between neighbors at the midpoint
  `(prev + next) / 2`; append at `max + 1`.
- When a gap gets too small (`< 1e-6`), renumber the column's cards to
  `1.0, 2.0, 3.0, …` in one transaction. Same scheme for column order and
  project order.

## Data model (D1 / SQLite dialect)

```sql
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
CREATE INDEX idx_cards_column    ON cards(column_id, position)
  WHERE archived_at IS NULL;
```

Seed: project `Main` (`is_default = 1`) with columns `Todo`, `Doing`, `Done`.

## Surfaces

### 1. Web UI (SvelteKit on Cloudflare Workers)
- Board view: horizontal columns, scrollable on mobile; cards draggable
  (svelte-dnd-action) with optimistic UI + server confirmation.
- Card quick-edit modal (desktop): title, markdown editor with preview,
  archive button, link to the full item page.
- **Item page** `/c/<id>` — the canonical, deep-linkable view of a card: full
  rendered markdown, in-place edit mode, move-to-column control, archive.
  Card taps navigate here on small screens instead of opening the modal.
- Column management inline (add at end, rename in place, drag to reorder).
- Project switcher + create/rename/delete project.
- Mutations go through SvelteKit server routes (form actions / +server
  endpoints) querying D1 directly. **No separate REST API** — MCP is the only
  other surface.
- Refresh model: plain reload/invalidate after mutations. No websockets;
  a human and agents rarely edit the same second, and last-write-wins is fine.

### 2. MCP server (dedicated Worker, same D1 binding)
Transport: Streamable HTTP at `/mcp`. Stateless (no Durable Objects).

Tools (all return compact JSON):

| Tool | Params | Behavior |
|---|---|---|
| `list_projects` | – | id, name, slug of every project |
| `get_board` | `project` (slug or id) | columns with their non-archived cards, ordered; card bodies truncated to a preview |
| `get_card` | `card_id` | full card incl. complete `body_md` |
| `create_card` | `project`, `column` (name or id), `title`, `body_md?`, `top?` | append (or prepend) to column |
| `update_card` | `card_id`, `title?`, `body_md?` | partial update |
| `move_card` | `card_id`, `column` (name or id), `before_card_id?` | move across/within columns; default end of target |
| `archive_card` | `card_id` | soft delete |
| `create_column` | `project`, `name` | append |
| `rename_column` | `column_id`, `name` | |
| `create_project` | `name` | seeds Todo/Doing/Done |

Errors are returned as MCP tool errors with human-readable messages
("column 'Doing' not found in project 'main' — available: Todo, Done").

## Auth

- **MCP Worker**: static bearer token. `Authorization: Bearer <token>` checked
  against a Worker secret (`wrangler secret put MCP_TOKEN`). Constant-time
  compare. 401 otherwise.
- **Web UI**: Cloudflare Access (Zero Trust, free tier) in front of the Worker —
  one-time email OTP / Google login per browser, zero auth code in the app.
  Works fine from iPhone Safari.
- Agents connect with:
  `claude mcp add --transport http kanban https://<mcp-worker-url>/mcp --header "Authorization: Bearer <token>"`

## Nice-to-haves (post-v1, only if wanted)

- PWA manifest so the board installs to the iPhone home screen.
- Nightly export of all boards to markdown files pushed to a private GitHub repo
  (one-way backup — the original md-files idea, done in the direction that's easy).
- OAuth on the MCP Worker (Cloudflare `workers-oauth-provider`) if claude.ai web
  connectors ever need direct access.
