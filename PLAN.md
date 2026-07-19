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

## Calendar & deadlines expansion (added 2026-07-19)

Three sequential phases. Phase 5 is standalone and valuable on its own; 6 is a
zero-auth quick win; 7 is the only phase that touches Google credentials.
Decision recorded up front: **sync is one-way (kanban → calendar) only.**
Mirroring calendar edits back into the board is the same trap as bidirectional
git sync (CONTEXT.md §1) and is explicitly out of scope. Auth uses a **service
account with a shared calendar**, not OAuth — this is a single-user app, and
OAuth's consent-screen/verification/refresh-token machinery buys nothing here
(see CONTEXT.md §5, "boring on purpose").

Note on paths: the web app now lives at the repo root (`src/`), not
`apps/web/` — the layout diagram above predates that move. Paths below are
current reality.

## Phase 5 — Deadlines (no Google)

1. Migration `0003_card_due_at.sql`:
   `ALTER TABLE cards ADD COLUMN due_at TEXT;` — nullable. Contract:
   `YYYY-MM-DD` means an all-day deadline; a full ISO 8601 UTC datetime means
   a timed one. No new index (board queries already fetch cards; scale is
   personal).
2. `packages/db`: add `due_at` to the `Card` type; `createCard` / `updateCard`
   accept optional `due_at` (validate parseable date / datetime, `null` clears
   it — same nullable-field pattern as `archived_at`). Vitest cases: set,
   clear, reject garbage strings.
3. Web UI (Svelte MCP tooling as usual):
   - `CardModal.svelte` and the item page (`routes/c/[id]`): date (+ optional
     time) input with a clear button, wired through the existing
     `api/cards` update route.
   - `Card.svelte`: due badge with relative label ("today", "tomorrow",
     "Jul 24"); overdue state gets a distinct token-based treatment consistent
     with `design/DESIGN.md` — extend the token table there, don't invent
     ad-hoc colors.
   - No ordering changes: kanban order stays manual; the badge is signal only.
4. MCP (`apps/mcp/src/tools.ts`): `create_card` and `update_card` gain an
   optional `due_at` param (zod, same friendly-error contract); `get_board`
   and `get_card` include `due_at` in output so agents can see deadlines.

**Verify:** vitest green; in the browser set/clear a deadline and see the
badge (incl. an overdue card); via MCP create a card with `due_at` and confirm
the badge appears in the UI.

## Phase 6 — "Add to Google Calendar" template links (zero auth)

1. `src/lib/calendarLink.ts`: pure function building
   `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&details=…`.
   All-day: `dates=YYYYMMDD/YYYYMMDD+1` (end is exclusive). Timed:
   `YYYYMMDDTHHmmssZ/…Z` with a default 1-hour duration. `details` carries a
   deep link back to the card's item page (`/c/<id>` on the deployed origin).
   Unit-test the date formatting (all-day, timed, month/year boundaries).
2. Show an "Add to Google Calendar ⤴" link (new tab) on `CardModal.svelte`
   and the item page whenever `due_at` is set.
3. No MCP change — agents have no use for a browser URL.

**Verify:** click the link on an all-day card and a timed card; Google's
event-creation page opens prefilled with correct title, date/time, and a
working link back to the card. **Then live with 5+6 for a while before
starting 7 — template links may cover the real need.**

## Phase 7 — Service-account sync + day snapshots

The only phase with credentials. Google's Node SDK (`googleapis`) is too heavy
for Workers — use plain REST via `fetch` with a WebCrypto-signed JWT.

1. **User setup doc first: `docs/google-calendar-setup.md`.** Step-by-step
   instructions Michele follows once, written for someone who has never opened
   Google Cloud Console. Must cover, in order:
   - Create a Google Cloud project (console.cloud.google.com → New Project).
   - Enable the **Google Calendar API** (APIs & Services → Library).
   - Create a **service account** (IAM & Admin → Service Accounts) — no roles
     needed; it only ever touches the Calendar API, not GCP resources.
   - Create a **JSON key** for it (Keys tab → Add key → JSON) and what the
     downloaded file contains (`client_email`, `private_key`).
   - In **Google Calendar** (calendar.google.com → calendar Settings →
     "Share with specific people"): add the service account's `client_email`
     with **"Make changes to events"** permission.
   - Find the **calendar ID** (same settings page, "Integrate calendar" —
     for the primary calendar it's the Gmail address).
   - Wire secrets into the app:
     `wrangler secret put GOOGLE_SA_EMAIL` / `GOOGLE_SA_KEY` (the PEM
     `private_key` from the JSON) / `GOOGLE_CALENDAR_ID` — on **both**
     Workers (web + mcp) — and the same three in `.dev.vars` for local dev
     (gitignored; confirm `.gitignore` covers it).
   - Troubleshooting table: `404 Not Found` on the calendar → calendar not
     shared with the SA / wrong calendar ID; `invalid_grant` → malformed key
     (newlines mangled — paste the PEM with real `\n` handling) ;
     `403 accessNotConfigured` → Calendar API not enabled.
2. Migration `0004_card_gcal_event.sql`:
   `ALTER TABLE cards ADD COLUMN gcal_event_id TEXT;`
3. **`packages/gcal`** (new workspace package — both Workers need it, same
   pattern as `packages/db`):
   - `auth.ts`: import the PKCS8 key via WebCrypto, sign an RS256 JWT
     (scope `https://www.googleapis.com/auth/calendar.events`), exchange at
     `oauth2.googleapis.com/token`, cache the access token in-memory per
     isolate until near expiry.
   - `events.ts`: `upsertEvent`, `deleteEvent`, `listDay(date)` against the
     Calendar v3 REST API. Event mapping: summary = card title, description =
     deep link to `/c/<id>`, all-day vs timed from the `due_at` contract of
     Phase 5.
   - Unit-test the pure parts (JWT assembly, event-body mapping) with vitest;
     token exchange is verified live in the verify gate.
4. **One-way sync hooks** in the web API routes and MCP tools, after the DB
   write succeeds:
   - due_at set/changed → upsert event, store `gcal_event_id`;
   - due_at cleared, card archived, or card deleted → delete event, clear id;
   - title change on a card that has an event → patch summary.
   - Failure policy: calendar errors must never fail the card mutation — log
     and continue; the card is the source of truth. Use `ctx.waitUntil` /
     SvelteKit `platform.context.waitUntil` so sync doesn't block responses.
5. **Day snapshots** (read-only glance, link out — do not rebuild GCal):
   - `api/agenda?date=YYYY-MM-DD` route → `listDay` (cache ~5 min via the
     Cache API to stay polite on quota).
   - `AgendaStrip.svelte`: compact list of that day's events (time + title),
     each linking to the event's `htmlLink` on calendar.google.com; a date
     picker for "show me this day". Placement: collapsible strip under the
     Topbar. Tokens from `design/DESIGN.md`.

**Verify:** follow `docs/google-calendar-setup.md` from scratch as written —
the doc is a deliverable; if a step confuses, fix the doc. Then end-to-end:
set a deadline in the UI → event appears in Google Calendar with a working
back-link; change the deadline → event moves; archive the card → event gone;
same cycle via an MCP agent; agenda strip shows today's real events; kill the
secrets locally and confirm card CRUD still works with sync silently skipped.

## Deferred (tracked, not planned)

- Nightly markdown export → private GitHub repo (backup).
- OAuth on the MCP Worker for claude.ai web connectors.
- Live updates (polling or Durable Object websocket) if last-write-wins ever
  actually bites.

## Order & effort

Phases are strictly sequential; each has its own verify gate. Rough effort:
Phase 0+1 one sitting, Phase 2 the bulk (2–3 sittings), Phase 3 one sitting,
Phase 4 one sitting.

Calendar expansion: Phase 5 one sitting, Phase 6 under an hour, Phase 7 two
sittings (one for `packages/gcal` + sync hooks, one for the setup doc, agenda
strip, and live verification). 5→6→7 strictly in order, with a deliberate
usage pause between 6 and 7.
