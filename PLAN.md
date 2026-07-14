# easyTodoKanban — Implementation Plan

Stack: pnpm workspace monorepo · SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare` ·
Cloudflare Workers + D1 · MCP TypeScript SDK (Streamable HTTP, stateless).

## Repo layout

```
easyTodoKanban/
├── SPEC.md / CONTEXT.md / PLAN.md
├── design/                   # ★ visual reference — do not redesign, port it
│   ├── board.html            # board mockup (canonical tokens, all states)
│   ├── card.html             # open-item page mockup (route /c/<id>)
│   ├── DESIGN.md             # token table, component map, navigation model
│   └── screenshots/          # rendered targets (board, modal, item page)
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── packages/
│   └── db/                   # shared: schema types, query functions, position logic
│       ├── src/
│       │   ├── types.ts      # Project, Column, Card
│       │   ├── queries.ts    # all SQL, takes a D1Database handle
│       │   └── position.ts   # midpoint insert + renumber logic
│       └── migrations/       # wrangler d1 migrations (single source of truth)
│           └── 0001_init.sql # schema + Main project seed (see SPEC.md)
├── apps/
│   ├── web/                  # SvelteKit app
│   │   ├── wrangler.jsonc    # d1 binding: DB -> <database_id>
│   │   └── src/...
│   └── mcp/                  # MCP server Worker
│       ├── wrangler.jsonc    # same d1 binding: DB -> <database_id>
│       └── src/
│           ├── index.ts      # fetch handler: auth check + MCP transport
│           └── tools.ts      # tool definitions -> packages/db queries
```

Rule: **all SQL lives in `packages/db`**. The web app and MCP server are thin
callers. Migrations run via `wrangler d1 migrations apply` from one place.

## Phase 0 — Scaffold (no features)

1. `git init`; root `package.json` + `pnpm-workspace.yaml`.
2. Create D1 database: `wrangler d1 create easy-todo-kanban` → note `database_id`.
3. Scaffold `apps/web`: `pnpm create svelte` (SvelteKit, TypeScript) +
   `@sveltejs/adapter-cloudflare`; wrangler.jsonc with the D1 binding.
4. Scaffold `apps/mcp` from Cloudflare's remote-mcp-authless template
   (`npm create cloudflare@latest -- --template=cloudflare/ai/demos/remote-mcp-authless`),
   strip demo tools, add the same D1 binding.
5. `packages/db` with migration `0001_init.sql` (schema + seed from SPEC.md).
   Apply locally (`--local`) and remotely.
6. Type generation: `wrangler types` in both apps so `env.DB` is typed.

**Verify:** `pnpm dev` serves the SvelteKit skeleton against local D1;
`wrangler dev` in apps/mcp responds to an MCP `initialize` request;
both deploy (`wrangler deploy` / adapter deploy) and hit the remote D1.

## Phase 1 — Data layer (`packages/db`)

1. `position.ts`: `positionBetween(prev, next)`, `needsRenumber(gap)`,
   `renumberColumn(db, columnId)` — pure logic + one transactional query. Unit
   tests with vitest (pure functions; fake neighbors).
2. `queries.ts`: typed functions for every operation in SPEC.md's tool table
   (list projects, board fetch with ordered columns+cards, card CRUD, move,
   column CRUD, project CRUD). Board fetch = 2 queries (columns, cards),
   assembled in JS — not N+1.
3. Name-or-id resolution helpers (`resolveProject('main' | 3)`,
   `resolveColumn(project, 'Doing' | 7)`) with the friendly-error contract
   from SPEC.md.

**Verify:** vitest suite green, including position renumber edge cases
(insert at head/tail, gap exhaustion triggers renumber).

## Phase 2 — Web UI (`apps/web`)

Use the Svelte MCP server / svelte-file-editor agent for every component
(Svelte 5 runes).

**The design is already done: `design/board.html` + `design/DESIGN.md`.**
Port it — do not redesign. Start by copying the `:root` tokens (light + dark)
into the global stylesheet, then build each component against its mockup
selector using the structure map in DESIGN.md. Compare against
`design/screenshots/` as you go. The mockup's inline JS is throwaway; its CSS
(especially the drag/focus/reduced-motion states) is the contract. One
adaptation is required: column hues must cycle from a palette by column
position (columns are dynamic — see DESIGN.md "signature element").

1. **Read path:** `+page.server.ts` loads board via `packages/db`; board page
   renders columns + cards; project switcher; markdown preview via `marked`
   (sanitized with DOMPurify) on the card modal.
2. **Mutations:** form actions / `+server.ts` endpoints per operation, all
   delegating to `packages/db`, then `invalidate()`.
3. **Drag & drop:** `svelte-dnd-action` on columns (card drop zones) and on the
   column strip (column reorder). On drop: optimistic local move + POST
   `{cardId, targetColumn, beforeCardId}`; on error, invalidate to resync.
4. **Card editor modal:** title input + body textarea with Edit/Preview toggle;
   archive button; "open ⤢" link to the item page. Archived view page with
   restore.
5. **Item page** `routes/c/[id]`: canonical deep-linkable card view per
   `design/card.html` — rendered markdown, in-place edit, move select,
   archive. On small screens card taps navigate here instead of the modal
   (see DESIGN.md "Navigation model").
6. **Column & project management:** inline add/rename/delete with the
   empty-column guard from SPEC.md.
7. **Mobile pass:** columns as horizontal snap-scroll (already specced in the
   mockup's `@media (max-width: 640px)` block); touch-friendly drag
   (svelte-dnd-action supports touch); test in responsive mode + real iPhone,
   target `design/screenshots/board-mobile.png`.

**Verify:** `/verify` skill — drive the real flow in a browser against local
D1: create project → add column → add card with markdown → drag across
columns → reload → order persisted. Then on the deployed URL from a phone.

## Phase 3 — MCP server (`apps/mcp`)

1. Bearer auth in the fetch handler: constant-time compare against
   `env.MCP_TOKEN`; 401 with a plain message otherwise.
2. Implement the 10 tools from SPEC.md's table with the MCP TS SDK —
   zod schemas, each tool a thin wrapper over `packages/db`. `get_board`
   truncates `body_md` to ~200 chars (agents call `get_card` for full text).
3. Friendly tool errors (unknown column lists available columns, etc.).
4. `wrangler secret put MCP_TOKEN` (generate: `openssl rand -hex 32`); deploy.

**Verify:** end-to-end with a real agent:
`claude mcp add --transport http kanban <url>/mcp --header "Authorization: Bearer …"`,
then in a fresh Claude Code session: list the board, create a card, move it —
confirm each change appears in the web UI. Also confirm a request without the
token gets 401.

## Phase 4 — Access, polish, ship

1. Put Cloudflare Access in front of the web app's hostname (email OTP for
   michele@remics.tech). Confirm the MCP hostname is NOT behind Access.
2. Empty states, loading states, error toasts; keyboard shortcut for new card.
3. PWA manifest + icons (installable from iPhone Safari). Optional in v1.
4. README.md: setup, deploy, how to connect an agent. Update PROJECTS.md in
   the workspace root with a one-liner for this project.
5. Push to a private GitHub repo.

**Verify:** full loop — phone browser passes Access and can drag cards; an
agent on the desktop moves a card and the change shows on the phone after
refresh.

## Deferred (tracked, not planned)

- Nightly markdown export → private GitHub repo (backup).
- OAuth on the MCP Worker for claude.ai web connectors.
- Live updates (polling or Durable Object websocket) if last-write-wins ever
  actually bites.

## Order & effort

Phases are strictly sequential; each has its own verify gate. Rough effort:
Phase 0+1 one sitting, Phase 2 the bulk (2–3 sittings), Phase 3 one sitting,
Phase 4 one sitting.
