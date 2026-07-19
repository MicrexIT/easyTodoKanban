# easyTodoKanban

Personal kanban for one human + AI agents. Visual board in the browser; agents manage the same data via MCP tools. Runs on Cloudflare Workers + D1 (~$0).

## Stack

- **Web UI**: SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`
- **MCP**: Cloudflare Worker, Streamable HTTP at `/mcp`, bearer token auth
- **DB**: Cloudflare D1 (shared binding). All SQL lives in `packages/db`
- **Images**: Cloudflare R2 for image bytes; D1 stores attachment metadata only

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

# Create private object storage for card/muse images once
pnpm exec wrangler r2 bucket create easytodo-media

# Put the real database_id into BOTH:
#   wrangler.jsonc
#   apps/mcp/wrangler.jsonc

# Apply migrations (local miniflare DB + remote)
pnpm db:migrate:local
pnpm db:migrate:remote

# MCP bearer token (remote only)
openssl rand -hex 32 | pnpm exec wrangler secret put MCP_TOKEN --config apps/mcp/wrangler.jsonc
```

Google Calendar synchronization is optional. Follow the one-time [service-account setup guide](docs/google-calendar-setup.md) to configure the three calendar secrets on both Workers. Without those secrets, deadlines and Phase 6 template links continue to work normally and the agenda strip reports that Calendar is not configured.

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

## Board management

Use **manage** beside the board tabs to drag boards into a new order, rename them, or delete boards.
The last remaining board is protected. If the default board is deleted, the next board becomes the
default automatically. Board URLs keep their original slug when renamed, so existing links remain
valid.

## Card / muse pictures

Pictures can be added from either the quick card modal or the full card page. The browser converts
uploads to WebP, limits the longest edge to 1600 px, and targets 1.5 MB. The server accepts only
JPEG, PNG, or WebP content and enforces a 2.5 MB hard limit.

The binary image is kept in the private `easytodo-media` R2 bucket. D1 stores only its object key,
filename, dimensions, and byte count. Removing a picture, permanently deleting an archived card,
or deleting a board also removes the corresponding R2 objects. Archiving a card preserves its
pictures so they return when the card is restored.

Cloudflare Images is not required for this first version. R2 plus client-side compression keeps the
storage model simple and inexpensive; Images transformations can be layered on later if the app
needs multiple generated sizes or format negotiation at larger scale.

## Google Calendar

Cards with deadlines sync one way to a shared Google Calendar. Creating or changing a deadline creates or updates its event; changing the title updates the event summary; clearing the deadline, archiving the card, or permanently deleting it removes the event. Calendar errors are logged and never roll back the card mutation because the kanban is the source of truth.

The collapsible agenda strip under the board tabs shows a five-minute-cached snapshot of any selected day and links each event to Google Calendar. See [docs/google-calendar-setup.md](docs/google-calendar-setup.md) for setup and troubleshooting.

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
| `add_card_image` | attach an HTTPS or base64 JPEG/PNG/WebP to a card |
| `get_card_image` | return an attachment as MCP image content for vision clients |
| `delete_card_image` | permanently remove an attachment from R2 and D1 |

The MCP Worker uses the same private `MEDIA` R2 binding as the web app. `get_board` and `get_card`
include attachment IDs and metadata; agents call `get_card_image` only when they need the pixels.

## Design

Port `design/board.html` + `design/card.html` — tokens and interaction states are the contract. See `design/DESIGN.md`.
