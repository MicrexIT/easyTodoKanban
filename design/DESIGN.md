# easyTodoKanban — Design Reference

Two self-contained static mockups (no dependencies, no build — open in a
browser) are the canonical visual reference for the app:

- `board.html` — the kanban board, card quick-edit modal, all interaction
  states. **Tokens are canonical here**; `card.html` carries a copy.
- `card.html` — the open-item view (route `/c/<id>`): full rendered markdown,
  in-place edit mode, move-to-column control, archive.

The implementing agent should **port their CSS and markup structure into the
SvelteKit components**, not redesign. Screenshots of the intended result are
in `screenshots/` (board light/dark/mobile, card modal, card page light/dark).

## Concept

A planning table. Dot-grid "drafting paper" background; columns are labeled
strips with a colored left rail; cards are clean slips. The tool is shared by
a human and AI agents, so **monospace is the machine-facing voice** (column
labels, card ids, timestamps, project tabs, editor) and the system sans is the
human-facing voice (card titles, rendered markdown). Keep that split — it is
the identity of the app.

## Tokens

All design decisions live as CSS custom properties on `:root` in `board.html`
(dark scheme via `prefers-color-scheme`). Port them verbatim into the app's
global stylesheet. Summary:

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#E7EAEE` | `#14181D` | page, with dot grid (`--dot`, 22px) |
| `--surface` | `#F2F4F7` | `#1B2127` | columns, top bar |
| `--card` | `#FFFFFF` | `#222932` | cards, modal, active tab |
| `--ink` / `--ink-2` / `--ink-3` | `#1C242E` / `#5A6572` / `#8B95A1` | dark equivalents in file | text hierarchy |
| `--line` | `#D8DDE3` | `#2B333C` | hairline borders |
| `--accent` | `#2F6E5E` | `#4FA98F` | verdigris — **interaction only**: focus, drag states, primary button, links-on-hover. Never decoration. |
| `--danger` | `#A34B3D` | `#C46A5B` | archive/delete affordances |
| `--hue-todo/doing/done` | slate / amber `#C07A21` / moss `#4E8A5F` | same | per-column rail + card id |

Type: `--sans` (system stack) and `--mono` (ui-monospace stack). No webfonts —
keep it dependency-free and fast.

## Signature element — the column label chip

Each column's identity is its **label chip** (`.column-tag`): the column name
in mono uppercase, set in its hue on a 14% tint of the same hue
(`color-mix`), like a label taped on the strip. The hue is echoed by the card
`#id` color inside the column and by the chip on the open-item page — the chip
is the status indicator everywhere. **In the real app, column hues must come
from data, not names**: assign from a small cycling palette by column position
(the mockup's todo/doing/done hues are the first three), since columns are
dynamic and user-named. Hues have separate light/dark values — port both sets.

## Interaction states (the part to preserve exactly)

- `.card.dragging` — 45% opacity + 1.2° rotate on the source card.
- `.cards.drag-over` — target list gets a soft accent wash (`--accent-soft`).
- `.drop-slot` — 3px accent bar for insert position (svelte-dnd-action's
  placeholder should be styled like this).
- Focus: 2px `--accent` outline, offset 2 — on every interactive element.
- `prefers-reduced-motion` kills all transitions.

## Structure map (mockup → app component)

| Mockup selector | Component |
|---|---|
| `.topbar`, `.projects`, `.project-tab` | `Topbar.svelte` — logotype, project tabs, archived link |
| `.board` | `Board.svelte` — horizontal scroll, snap on mobile |
| `.column`, `.column-head` | `Column.svelte` — rail, mono header, count, add-card |
| `.card`, `.card-body`, `.card-meta` | `Card.svelte` — title, rendered md preview, mono meta row |
| `.add-column` | dashed ghost button at board end |
| `dialog.card-modal`, `.editor-tabs` | `CardModal.svelte` — mono breadcrumb `project / column · #id`, title input, write/preview tabs, archive left / save right, "open ⤢" link to the item page |
| `card.html`: `.sheet`, `.status-row`, `.item-body`, `.item-editor` | `routes/c/[id]/+page.svelte` — open-item page: chip + id + move select + edit button, title, mono facts line, rendered markdown, in-place edit mode |

## Navigation model

- Board card click → **modal** (quick edit) on desktop; → **item page** on
  small screens (the modal is cramped on a phone).
- The item page is the canonical, deep-linkable view: `/c/<id>`. Agents and
  humans can share these URLs; the modal's "open ⤢" leads there.
- Item page breadcrumb returns to the card's board.

## Content rules the mockup encodes

- Card body on the board is a *preview*: rendered markdown, small and muted
  (`--ink-2`); checklists render as mono `[ ]`/`[x]` boxes, done items get a
  moss box and struck text. Truncate long bodies — full content lives in the modal.
- Meta row: `#id` in the column hue + relative "updated …" time, mono 10.5px.
- Editor is monospace; preview tab renders with the sans. `h3` in rendered
  markdown renders as a small mono uppercase label — headings inside a card
  are section markers, not display type.
- Copy is lowercase, plain verbs: "save", "archive", "＋ add column",
  "drag to move · click to edit".

## What the mockups do NOT cover (implementer's judgment, same tokens)

Empty column state, archived view (suggested: a plain list reusing `.card`
minus drag affordances), project create/rename UI, error toasts, PWA icons.
