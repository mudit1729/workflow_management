# Frontend stack recommendation for `wf` (SPA embedded in a Rust binary)

**Recommendation:** use React 19 + Vite 8 + TypeScript, with TanStack Router/Query, Tailwind v4, shadcn/ui on Radix, pragmatic-drag-and-drop, react-resizable-panels, cmdk and sonner. Embed the built `dist/` with `rust-embed`, and serve it from axum with an `index.html` fallback for client routes.

I checked versions on 2026-10-22 with `npm view` (node v25.5.0, pnpm 10.28.2, cargo 1.94.0). I also built throwaway test bundles in the scratchpad to measure gzip sizes.

## 1. Framework choice

| Criterion | React 19 | Svelte 5 | SolidJS |
|---|---|---|---|
| Kanban drag-drop | pragmatic-dnd 4.0 (core + auto-scroll measured at +9 KB gz) or @dnd-kit/react 0.5.1 (+36 KB gz, still 0.x) | svelte-dnd-action 0.9.80: works, but has quirks with nested zones and virtualization | @thisbeyond/solid-dnd 0.7.5, a thin library |
| Deep-linked drawer and routing | TanStack Router 1.170: typed params and search, nested layouts keep the board mounted | SvelteKit 3 in SPA mode is heavier; no TanStack Svelte Router package on npm | @solidjs/router 1.0 |
| Ready-made parts (sidebar, resizable panels, command palette, toasts, tabs) | shadcn 4.22 has all of them, including a collapsible Sidebar | shadcn-svelte 1.7, bits-ui 2.20, paneforge 1.0.2 | Kobalte 0.13 (pre-1.0) |
| Measured bundle, gzip | Full stack without markdown: **157 KB**. With markdown: 203 KB. React alone: 69 KB | Equivalent stack without router: **80 KB** | Smallest |
| Agents writing and maintaining it | Best | Good | Weak |

Svelte would make the bundle about half the size. That doesn't matter here: the app is served from localhost out of the binary, and a single archify diagram is about 760 KB. React wins on the ecosystem match and on how reliably agents can build and maintain it. Solid's component ecosystem is too thin.

## 2. Versions

| Package | Version | Notes |
|---|---|---|
| react / react-dom | 19.3.1 | Released 2026-10-14 |
| vite / @vitejs/plugin-react | 8.3.5 / 6.1.2 | Vite 8.3.5 is one day old; the lockfile pins it |
| typescript | 7.0.2 | The native compiler. **typescript-eslint requires TS <6.1**, so use Biome, or pin typescript 6.0.3 |
| @biomejs/biome | 2.6.2 | Linting and formatting |
| @tanstack/react-router + router-plugin | 1.170.45 / 1.168.47 | |
| @tanstack/react-query | 5.104.5 | |
| @tanstack/react-virtual | 3.14.21 | |
| tailwindcss + @tailwindcss/vite | 4.3.3 | |
| shadcn (CLI) / radix-ui | 4.22.1 / 1.8.1 | |
| tw-animate-css | 1.4.0 | |
| @atlaskit/pragmatic-drag-and-drop | 4.0.0 | Plus hitbox 3.0.0 and auto-scroll 3.2.1. **Skip the react-drop-indicator package**: it pulls in @compiled and @atlaskit/tokens |
| react-resizable-panels | 4.14.8 | v4 API is `Group`, `Panel`, `Separator` |
| cmdk | 1.1.1 | Stable, last release 2025-03 |
| sonner | 2.0.8 | |
| lucide-react | 1.61.0 | |
| zustand | 5.0.16 | UI preferences only |
| react-markdown / remark-gfm / rehype-sanitize | 10.1.0 / 4.0.1 / 6.0.0 | |
| shiki | 4.5.0 | Core + JavaScript regex engine + 7 languages + 2 themes measured at 103 KB gz. Load it lazily |
| minisearch | 7.2.0 | Client-side search |
| date-fns | 4.4.0 | |
| vitest / @playwright/test | 5.0.5 / 1.64.1 | |
| Rust crates | axum 0.8.9, tower-http 0.7.1, rust-embed 8.13.0 (or memory-serve 2.4.0), notify 8.2.0 (9.0 is still an RC), notify-debouncer-full 0.7.0, comrak 0.57.0 | |

## 3. Markdown: split the work

- **Rust parses the structure** and sends JSON. That covers frontmatter, sections, entries (`{author, ts, kind, body_md}`), and checklist items for both criteria and plan steps. Each item carries a **byte span and the file's content hash**.
  - Rust has to parse this anyway for the index, group roll-ups, lint and write-back.
  - Checkboxes must render from Rust's spans, so the UI and the file editor never disagree about which line is which.
- **The client renders only the prose fragments**, using react-markdown with remark-gfm and rehype-sanitize (raw HTML off). A `components` map lets the client swap in its own UI:
  - `code` with lang `archify` becomes an `ArchifyDiagramCard`, matched to Rust's diagram list by source offset.
  - Other code blocks are highlighted by Shiki, loaded only when one appears.
  - `@handle` becomes an `AuthorChip`, and `[[issue]]` becomes an `IssueLink`.
- Fully server-rendered HTML (comrak) would lose those component mappings. Keep it only as a fallback for printing or export.

## 4. Embedding archify diagrams

What the archify template supports: `?embed=1` hides the viewer chrome and `?theme=light|dark` sets the theme. There is no `postMessage` support. Each file is about 760 KB because the fonts are inlined.

- **Use an `iframe` `src` URL, not `srcdoc`.** Inside `srcdoc`, `location.search` is empty, so `embed` and `theme` can't be passed; it would also bloat the JSON.
  - The daemon caches the rendered file as `<sha256>.html` and serves it at `/api/diagrams/<hash>.html` with `Cache-Control: immutable`.
- **The daemon injects a bridge script of about 20 lines** into the cached HTML:
  - A `ResizeObserver` posts `{type:'wf:size', h}` to the parent page.
  - A listener for `{type:'wf:theme'}` sets `data-theme`, so theme changes don't reload the iframe.
- **Sandbox it:** `sandbox="allow-scripts"` (opaque origin; archify's `localStorage` calls are already wrapped in try/catch) plus `loading="lazy"`. Only mount the iframe when an `IntersectionObserver` sees the card.
- **Card height** defaults to `clamp(220px, 32vh, 420px)`. The bridge's height may grow it up to that cap, which keeps scrolling minimal.
- **Fullscreen** uses a Dialog with the iframe loaded *without* `embed=1`, which gives the full viewer (finder, route probe, exports). That iframe adds `allow-downloads`.
- **Validation errors:** the daemon sends `{status:'invalid', errors:[{path, msg}]}`. The card shows the error list, the raw JSON and a "copy for agent" button.

## 5. Layout with minimal scrolling

- **Lock the shell to the viewport:** `html, body, #root { height: 100dvh; overflow: hidden }`.
  - Grid rows are `48px 1fr` (top bar, then content).
  - The content is a horizontal panel group: `[NavRail | Main | Drawer]`. The drawer panel can collapse and its size is saved.
- **Only inner regions scroll:** each column body, each drawer tab panel, and the board horizontally. Put `min-h-0` and `min-w-0` on every grid or flex child; without it the inner regions won't scroll.
- **Columns** are the fixed status list (6–7), so there's no need to virtualize columns horizontally. Virtualize the cards inside a column once it has more than 40. Swimlanes (one per group, at a chosen depth) collapse.
- **Density:** a `data-density="compact|comfy"` attribute drives CSS variables. Cards use Tailwind v4 container queries, so their anatomy adapts to column width.
- **Drawer content:** tabs (Overview, Plan, Changes, Decisions, Learnings) instead of one long page. Overview is a small grid: goal, criteria ring and diagrams.
- **Responsive behaviour:**
  - 1280px and wider: three panes.
  - 1024–1280px: the drawer overlays the board as a Sheet.
  - Below 768px: one column at a time with a status switcher, and opening an issue goes to the full page.

## 6. Routing, live updates and write-back

- **Routes:**
  - `/w` is the board layout.
  - `/w/issue/$` is a child route that renders the drawer. It uses a splat because issue ids are nested paths like `platform/auth/sso`. The board stays mounted underneath.
  - `/issue/$` is the full page, using the same `IssueView` with `variant="page"`.
  - `/lib` and `/lib/item/$` work the same way for the library.
  - Filters live in validated search params (`?group=&author=&q=`), so they survive opening the drawer.
  - The Rust server returns `index.html` for any path that isn't under `/api`.
- **Live updates:** one `EventSource` on `/api/events`.
  - Events look like `{kind, id, rev}`. The client applies one with `setQueryData` only if its `rev` is newer.
  - Reconnects use `Last-Event-ID`; any gap triggers `invalidateQueries()`.
  - **Multiple tabs:** "Open in new page" encourages several tabs, but browsers cap HTTP/1.1 at 6 connections per origin, and localhost has no HTTP/2 without TLS. Use one SSE leader tab chosen over `BroadcastChannel`, which relays events to the other tabs.
- **Optimistic writes:** a mutation's `onMutate` moves the card immediately. The request is `PATCH /api/issues/:id/status {status}` with `If-Match: <file hash>`.
  - A 409 response rolls back and shows a toast such as "goal.md changed by @codex — reapply?".
  - Rust performs the surgical edit inside a per-file lock.
- **Dev setup:** the Vite proxy forwards `/api` to `wf serve --dev`. In release, `build.rs` (or an xtask) runs `pnpm build` and `rust-embed` packs `dist/` (pre-compressed with brotli).

## 7. Components

| Component | Built from | What it does |
|---|---|---|
| AppShell | Grid + resizable panels | Viewport-locked; ⌘B toggles nav, ⌘K opens the palette, Esc closes the drawer |
| NavRail | shadcn `Sidebar collapsible="icon"` | Switches Workspace / Library; contains the GroupTree; collapsed state persisted |
| GroupTree | Collapsible + `role=tree` | Nested groups with a status-count roll-up and mini progress bar per node; `_group.md` color dot |
| KanbanBoard | pdnd `monitorForElements` + auto-scroll | Status columns × group swimlanes; drops across swimlanes are disabled in v1 (that would be a folder move) |
| KanbanColumn | pdnd drop target + react-virtual | Count and WIP in the header, home-made drop indicator, scrolls internally |
| IssueCard | shadcn Card | Title, group breadcrumb, status, ProgressRing, AuthorStack, relative last activity, red blocked badge, lint dot (HoverCard), drift flag ("done, 2 criteria unmet"); "Move to…" menu as the keyboard alternative to dragging |
| IssueDrawer | Panel + Tabs | Header has breadcrumb, StatusSelect, "Open in new page" ↗, copy link, close |
| IssuePage | Same IssueView, 2 columns | Goal, criteria and plan on the left; ChangesTimeline on the right |
| CriteriaChecklist + ProgressRing | Checkbox + 2-circle SVG | Toggling sends a PATCH by item span; optimistic |
| PlanStepper | Custom | Phases (from H2s) contain steps marked done, active or pending; finished phases collapse |
| ChangesTimeline | Custom | Grouped by day with sticky headers; author-colored dots with bot or human glyph; filter by author or agent; relative time with absolute time on hover; file and commit chips |
| DecisionCards | Card + Badge + Collapsible | ADR-style: context, decision, consequences; status proposed/accepted/superseded; supersedes links; promote |
| LearningCards | Card variants | Tip, gotcha or pattern; "Promote to library" opens a Dialog prefilled with kind and tags, then POSTs |
| ArchifyDiagramCard | iframe + Dialog | See section 4 |
| LibraryView | Facets + MiniSearch + cards | Facets: kind, tags, source group, author; backlinks to the issues that produced or cite an item; opens in the drawer |
| ActivityFeed | Popover or panel | Workspace-wide recent events from an SSE ring buffer |
| CommandPalette | shadcn Command (cmdk) | Go to issue, group or library item; actions: move status, new issue or group from template, theme, density |
| Shared pieces | | MarkdownProse, AuthorChip/AuthorStack (stable hashed colors), StatusBadge, LintBadge, RelativeTime, EmptyState, toasts (sonner) |

**Theme:** a pre-paint inline script sets `data-theme` on `<html>`, and Tailwind uses `@custom-variant dark` on that attribute. The same value is sent to diagram iframes. No `next-themes` needed.

## Assumptions to confirm

1. Card order inside a column comes from priority, then last update. There's no manual ranking, so the UI never writes to files just because a card was reordered.
2. A workspace `authors.yaml` maps each `@handle` to agent or human, a display name and a color.
3. Swimlanes are top-level groups by default, with depth adjustable; cross-group dragging is off in v1.
4. Library search runs client-side with MiniSearch over the startup snapshot. Move it to Rust (tantivy) only beyond roughly 10k documents.
5. Use the system font stack; archify already bundles its own fonts.
6. Use TS 7 with Biome. If the team wants typescript-eslint, pin TS 6.0.3 instead.

The throwaway test bundles are in `/private/tmp/claude-501/-Users-muditj-Desktop-Projects-workflow/0570f2f9-8353-4a5e-90a4-5684744c13fd/scratchpad/sizecheck-react` and `.../sizecheck-svelte`.