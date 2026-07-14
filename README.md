# easyTodoKanban

Personal kanban for one human + AI agents. Visual board in the browser; agents manage the same data via MCP tools. Runs on Cloudflare Workers + D1 (~$0).

## Stack

- **Web UI**: SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`
- **MCP**: Cloudflare Worker, Streamable HTTP at `/mcp`, bearer token auth
- **DB**: Cloudflare D1 (shared binding). All SQL lives in `packages/db`

## Repo layout

```
easyTodoKanban/          # SvelteKit web app at repo root
├── packages/db/         # schema, queries, position logic
├── apps/mcp/            # MCP worker
├── design/              # visual reference (port, don't redesign)
├── SPEC.md / PLAN.md / CONTEXT.md
```

## Prerequisites

- Node 22+, pnpm 10+
- Cloudflare account + `wrangler login` (for remote D1 / deploy)

## Setup

```bash
pnpm install

# Create the D1 database once (note the database_id)
pnpm exec wrangler d1 create easy-todo-kanban

# Put the real database_id into BOTH:
#   wrangler.jsonc
#   apps/mcp/wrangler.jsonc

# Apply migrations (local miniflare DB + remote)
pnpm db:migrate:local
pnpm db:migrate:remote

# MCP bearer token (remote only)
openssl rand -hex 32 | pnpm exec wrangler secret put MCP_TOKEN --config apps/mcp/wrangler.jsonc
```

For **local MCP** auth, set `MCP_TOKEN` in `apps/mcp/.dev.vars`:

```
MCP_TOKEN=dev-token-change-me
```

## Develop

```bash
# Web UI (uses local D1 via wrangler)
pnpm dev

# MCP worker (separate terminal)
pnpm dev:mcp

# Unit tests (position logic)
pnpm test
```

Open http://localhost:5173 — you should land on the **Main** board (Todo / Doing / Done).

## Deploy

```bash
pnpm deploy:web   # builds SvelteKit + wrangler deploy
pnpm deploy:mcp
```

### Cloudflare Access (web only)

Put Access (email OTP) in front of the **web** hostname only. Leave the **MCP** hostname off Access so agents can send `Authorization: Bearer …`.

### Connect Claude Code

```bash
claude mcp add --transport http kanban https://<mcp-worker-url>/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

Then: list the board, create a card, move it — changes appear in the web UI after refresh.

## MCP tools

| Tool | Purpose |
|---|---|
| `list_projects` | id, name, slug |
| `get_board` | columns + cards (body truncated) |
| `get_card` | full card incl. `body_md` |
| `create_card` | append/prepend to column |
| `update_card` | title / body |
| `move_card` | across/within columns |
| `archive_card` | soft delete |
| `create_column` / `rename_column` | column mgmt |
| `create_project` | seeds Todo/Doing/Done |

## Design

Port `design/board.html` + `design/card.html` — tokens and interaction states are the contract. See `design/DESIGN.md`.
