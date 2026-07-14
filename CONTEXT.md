# easyTodoKanban — Context & Decision Log

Why this project exists and why the stack looks the way it does. Read this
before proposing architecture changes. Decisions dated 2026-07-14.

## The problem

Michele wants one todo system reachable from three kinds of clients:
his PC, his iPhone, and AI agents (Claude Code sessions) running on his
machines. Visual kanban, dynamic columns, drag-and-drop, markdown card bodies.

## Decisions

### 1. Database, not markdown files in a git repo — DECIDED
The first idea was `.md` files as the datastore, synced via GitHub pushes.
Rejected: three concurrent writers plus a web UI means building pull/merge/
conflict handling into the app — more complexity than a database, not less.
A drag-and-drop reorder would be a commit. Markdown survives as the card body
*format* (a TEXT column), and a one-way nightly export to a git repo remains a
possible backup feature (export is easy; bidirectional sync is the trap).

### 2. Not Laravel / Laravel Cloud — DECIDED
Laravel was the original preference, but:
- Laravel Cloud does not support SQLite (ephemeral filesystem; resets on every
  deploy/reboot). Their answer is Serverless Postgres — fine, but ~$0–2/mo and
  a scale-to-zero cold-start wrinkle if agents poll.
- This app is ~90% frontend (drag-and-drop, markdown editing). The backend is
  five CRUD endpoints. Laravel's strengths would go unused.
- The MCP ecosystem's best hosting story is TypeScript-native (Cloudflare).
If a future meta-goal is "get Laravel Cloud experience for client work," that
would be the one reason to revisit — the app itself doesn't care.

### 3. Cloudflare Workers + D1 + SvelteKit — DECIDED
- **D1** = managed SQLite semantics with persistence, on a free tier this app
  will never exhaust (5 GB, 5M row reads/day). Genuinely $0, no idle-billing
  anxiety, no cold DB starts.
- **SvelteKit** with `@sveltejs/adapter-cloudflare`, deployed as a Worker with
  static assets. Server routes query D1 directly through the platform binding.
- **Why not plain SQLite on a VPS/Fly.io**: works technically, but VPS prices
  surged (mid-2026) and it reintroduces a machine to maintain. Cloudflare free
  tier beats it on both cost and ops.
- Known coupling: D1 is queried through Cloudflare's binding, not a local file.
  Accepted — it's still plain SQL, export is trivial, and this is a personal tool.

### 4. MCP as the agent surface, no REST API — DECIDED
Agents get a dedicated **remote MCP server**: a second Worker bound to the
*same* D1 database (D1 is account-level; both Workers reference the same
`database_id`). It does NOT call the web app — it queries the DB directly,
sharing a query layer package with the SvelteKit app.
- Transport: Streamable HTTP, stateless (no Durable Objects needed for
  request/response CRUD tools).
- No public REST API. Two surfaces only: SvelteKit server routes (human UI)
  and MCP tools (agents). Add REST later only if a non-MCP consumer appears.

### 5. Auth: boring on purpose — DECIDED
- MCP Worker: single static bearer token (Worker secret). Enough for one
  trusted operator's agents on trusted machines.
- Web UI: Cloudflare Access (free) — no auth code in the app at all.
- Known limitation: claude.ai *web* custom connectors can't send custom
  headers; they need no-auth or OAuth. If that client ever matters, add
  Cloudflare's `workers-oauth-provider`. Claude Code (the actual client here)
  supports `--header` fine.

## Cost picture (for the record, July 2026)

- Cloudflare Workers free tier: 100k requests/day — orders of magnitude above
  personal use. D1 free tier: 5 GB, 5M reads/day, 100k writes/day.
- Rejected alternatives: Laravel Cloud Serverless Postgres (~$0.04/hr active,
  $5/mo plan with $5 credits); Turso free tier (viable, but a third vendor and
  a community Laravel driver were the deciding negatives back when Laravel was
  on the table); Fly.io + volume + Litestream (~$3/mo, real machine to babysit).

## Workspace notes

- Repo lives at `projects/easyTodoKanban` in the Remics workspace. Not a git
  repo yet — `git init` happens in Phase 0 of PLAN.md.
- Svelte tooling: this workspace has the Svelte MCP server + skills installed;
  use them when writing components (Svelte 5 runes syntax throughout).
- The UI design is settled and lives in `design/` (static `board.html` mockup,
  `DESIGN.md` token/component reference, target screenshots). Implementation
  ports this design; it does not invent a new one. Visual-direction changes go
  through Michele first.
