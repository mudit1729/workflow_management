# wf web UI: build contract (prototype on mocks)

> **Orchestrator note (read first if you are the `diagram` or `library-inbox` builder).**
> Those two builders were started early in a separate run, and they own their files.
> If you are one of them in the main run: do NOT write, edit or format any file. Run
> `node web/scripts/wait-for.mjs <your key>` (key = `diagram` or `library-inbox`) with a
> 10-minute Bash timeout, from the repo root. Re-run it while it prints `STILL_WAITING`.
> When it prints a JSON report, return exactly that report as your structured result.
> Every other builder: ignore this note.

This file is the integration contract for the parallel UI build. Every builder
follows it exactly. The product contract is `docs/plan/contract.md` (§1.10 API,
§1.11 frontend, §1.12 tokens, Part 3 §6 UI). If this file and the product contract
disagree, the product contract wins; note the conflict in your final report.

Goal: a clickable prototype of every UI element, running on mock data, so the user
can review each element and give feedback. It must look finished: calm, precise,
Linear-like. It is also the real `web/` codebase, so write production-quality code.

## Ground rules

- **Own only your files.** Each builder owns the paths listed under its name.
  Never edit another builder's files. If you need something from another
  module that is missing, code against the API below as if it exists and list
  the gap in your final report. The integrator fixes mismatches.
- **Foundation is read-only** for builders: `src/gen/types.ts`, `src/lib/{cn,status,format,hooks,nav,prefs}.ts`,
  `src/styles/**`, configs, `index.html`. Read them first. They define the shared vocabulary.
- **Imports:** `@/…` is `web/src/…`, `@mock/…` is `web/mock/…`. Feature folders
  export public components from their `index.ts`; import through it
  (`import { TaskPill } from "@/features/issue"` is fine inside other features; inside
  `features/issue` import files directly to avoid cycles).
- **Styling:** Tailwind 4 classes mapped to tokens (see the comment at the top of
  `src/styles/base.css`): `bg-bg bg-subtle bg-muted border-border border-border-strong text-fg
  text-fg-muted text-fg-faint bg-accent text-accent bg-accent-subtle text-accent-fg
  text-status-<status> bg-status-<status> text-stale text-danger text-needs-you bg-hue-1..8
  shadow-pop rounded-sm|md|lg font-mono`. Font sizes: `text-xs` 11, `text-sm` 12,
  `text-base` 13, `text-md` 14, `text-lg` 16, `text-xl` 20. Spacing utilities use the
  density-aware 4 px unit (`p-2` = 8 px comfy). Weights 400/500/600 only
  (`font-normal font-medium font-semibold`). Never write raw hex colors in components;
  for dynamic colors use `style={{ color: "var(--wf-hue-3)" }}` or `statusColor()`.
- **Design language:** neutral grays + one indigo accent. Color appears only when it
  means status, author or group. 1 px hairline borders, no shadows except `shadow-pop`
  on menus/popovers/dialogs/overlay drawer. Dense but breathable: 13 px base text,
  28 px control height (`h-7`), 24 px small controls (`h-6`). Icons from `lucide-react`
  at 14 px (`size={14}`), stroke 1.75. Motion 100–200 ms with `ease-wf`. Hover states are
  `bg-muted`/`bg-subtle`, never color. Use `tabular` for numbers. Truncate, never wrap
  into chaos. Empty states are quiet and name the skill or command that fills them.
- **Minimal scroll:** the shell is locked to `100dvh`; only inner regions scroll. Put
  `min-h-0 min-w-0` on every flex/grid child that should scroll.
- **Handles:** data stores handles without `@`; always render `@handle` in UI text.
- **Accessibility:** real buttons, labels on icon buttons (`aria-label`), focus-visible
  rings come from base.css, keyboard paths for every pointer action, color never alone
  (status has a glyph, authors have a handle, signals have an icon + tooltip).
- **Element names:** give each element's root `data-wf="<ComponentName>"` (e.g.
  `data-wf="IssueCard"`). The user refers to elements by these names when giving feedback.
- **Checks before you finish:** `pnpm -s typecheck 2>&1 | grep -E "<your paths>"` must show no
  errors in your files (errors in files you do not own are expected while others work);
  `pnpm -s exec biome check --write <your paths>` must end clean.
- **React 19:** `ref` is a regular prop (no forwardRef). Use function components.
- **Radix:** import primitives from the `radix-ui` package: `import { Dialog as DialogPrimitive } from "radix-ui"`
  (also `DropdownMenu`, `Popover`, `HoverCard`, `Tooltip`, `Tabs`, `Checkbox`, `Collapsible`,
  `Switch`, `ToggleGroup`, `Separator`, `VisuallyHidden`, `ScrollArea`).

## Routes (owned by shell; helpers in `src/lib/nav.ts`)

| path | renders | search |
|---|---|---|
| `/` | redirect to `/w` | |
| `/w` | `BoardLayout` → `BoardPage` | `group, swim, author, q, show` |
| `/w/i/$id` | `BoardLayout` → `BoardPage` + `IssueDrawer id` | board search + `tab, log` |
| `/i/$id` | `IssuePage id` | `tab, log` |
| `/lib` | `LibraryView` | `tab (items\|glossary), kind, q` |
| `/lib/$id` | `LibraryView` with `LibraryItemView id` open | |
| `/inbox` | `InboxView` | |
| `/kit` | `KitPage` (component gallery) | |

Features navigate only through `useOpenIssue`, `useCloseIssue`, `useBoardSearch`,
`useIssueTab`, `useGo` from `@/lib/nav`. Hash routing is used when `VITE_HASH_ROUTER=1`.

## Module map and public APIs

### ui-common builder: `src/components/ui/**`, `src/components/common/**`

`src/components/ui/index.ts` re-exports (shadcn-style, restyled to the tokens):
- `Button({ variant?: "primary"|"secondary"|"ghost"|"subtle"|"danger", size?: "sm"|"md"|"icon"|"icon-sm", ...button props })`
  — md = h-7, sm = h-6, icon = 7×7, icon-sm = 6×6. primary = accent bg; secondary = hairline.
- `IconButton({ label: string, icon: ReactNode, size?: "sm"|"md", ...})` — ghost icon button with tooltip = label.
- `Dialog, DialogTrigger, DialogContent({ title, description?, size?: "sm"|"md"|"lg"|"full", hideClose?, children }), DialogFooter, DialogClose`
- `Sheet({ open, onOpenChange, side?: "right", width?: number, children, title })` — non-modal-looking overlay panel with `shadow-pop`.
- `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem({ icon?, shortcut?, disabled?, hint? }), DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent`
- `Popover, PopoverTrigger, PopoverContent`, `HoverCard, HoverCardTrigger, HoverCardContent`
- `Tooltip({ content: ReactNode, side?, shortcut?: string, children })` and `TooltipProvider`
- `Tabs, TabsList, TabsTrigger({ count?: number }), TabsContent` — underline tabs, 13 px, count chip.
- `Segmented<T extends string>({ value: T, onChange(v: T), options: { value: T, label: ReactNode, count?: number, icon?: ReactNode }[], size?: "sm"|"md", "aria-label": string })`
- `Checkbox({ checked, onCheckedChange, variant?: "default"|"criterion", state?: "open"|"claimed"|"verified", disabled?, "aria-label"? })`
  — criterion variant: claimed = hatched fill, verified = solid fill with check.
- `Input`, `Textarea`, `SearchInput({ value, onChange, placeholder, shortcut?: "/" })`
- `Kbd({ combo: string })` — uses `comboKeys()`; `Kbd` renders small mono key caps.
- `Chip({ tone?: "neutral"|"accent"|"danger"|"stale"|"success"|"outline", icon?, size?: "xs"|"sm", children, title? })`
- `Separator`, `Collapsible, CollapsibleTrigger, CollapsibleContent`, `Switch`, `Skeleton`
- `Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem({ shortcut? }), CommandSeparator` (cmdk, styled)

`src/components/common/index.ts` re-exports:
- `AuthorChip({ handle: string, size?: "xs"|"sm", variant?: "chip"|"avatar"|"text" })` — avatar = 16 px (xs 14 px) tile in the author hue
  (`var(--wf-hue-<color>)`), rounded square with a bot glyph for agents, circle with initials for humans;
  chip = avatar + `@handle`; HoverCard shows name, kind, runtime, model, lanes. Unknown handle → gray + Q012 hint.
- `AuthorStack({ handles: string[], max?: number, size? })` — overlapping avatars, +N.
- `StatusIcon({ status: IssueStatus | TaskStatus, size?: number })` — Linear-style glyphs in status color:
  backlog dashed circle, planned/todo empty circle, in_progress half-filled, blocked circle with bar,
  review three-quarter, done filled check, cancelled filled x. Has `aria-label`.
- `StatusSelect({ issue: IssueSummary, size?: "sm"|"md", variant?: "pill"|"icon" })` — DropdownMenu of statuses;
  legal moves normal; illegal moves shown muted with hint "Needs Move anyway"; picking calls `useMoveIssue().move`.
- `RelativeTime({ ts, className?, long?: boolean })` — `relativeShort`, tooltip `absolute(ts)`, re-renders every 30 s.
- `EmptyState({ icon?, title, hint?, skill?: string, command?: string, action?: ReactNode, compact?: boolean })`
  — quiet; shows "Run the `write-plan` skill" and a copyable `wf …` command when given.
- `ProgressRing({ verified: number, claimed: number, total: number, size?: number (default 14), label?: boolean })`
  — solid arc = verified, hatched arc = claimed, track = border color; total 0 → dashed ring. Tooltip text
  "2 verified · 1 claimed · 5 criteria".
- `LintBadge({ counts: LintCounts, variant?: "dot"|"badge", onClick? })` — dot: 6 px, danger if errors, stale if warns, faint if info.
- `MarkdownProse({ md: string, diagrams?: Diagram[], issueId?: string, compact?: boolean, className? })`
  — react-markdown + remark-gfm + rehype-sanitize. Renders ```` ```wf-diagram\n<id>\n``` ```` via
  `ArchifyCard` from `@/features/diagram` (look up the id in `diagrams`); other code blocks as mono blocks
  (shiki lazy-loaded is optional); `[[ref]]` → `RefLink`; `@handle` → `AuthorChip variant="text"`;
  calm typography (13 px, 1.5 leading, 8 px paragraph gap, small H3/H4).
- `RefLink({ target: string, issueId?: string })` — `[[wf-3k9x2]]`, `[[wf-3k9x2#D-7f3k2]]`, `[[#T-4]]`, `[[lib-4tz7c]]`;
  resolves titles from the snapshot; dangling → dashed underline + F009 tooltip.
- `GroupPath({ path: string[], className? })` — faint "wf / web".
- `CopyButton({ text, label })`
- `MoveGateDialog()` — rendered once by the shell. Reads `useMoveGate()` from `@/lib/api`. Two modes:
  illegal move ("backlog → done is not an allowed move…" + "Move anyway") and done gate (lists `gaps`,
  "Move to Done anyway"). Primary action calls `confirm()`.
- `Toaster()` — sonner, themed with tokens, bottom-right, max 3.
- `Glyph` helpers: `KindIcon({ kind: ChangeKind | LearningKind | LibraryKind, size? })` — one lucide icon per kind.

### data builder: `web/mock/**`, `src/lib/api/**`, `src/lib/live/**`

`src/lib/api/index.ts` re-exports:
- `queryClient` (TanStack Query client)
- `api` — `{ snapshot(), issue(id), libraryItem(id), glossary(), search(q, scope?, k?), context(id, budget?), ops(op) }`.
  Uses the in-memory mock server (`@mock/server`) unless `import.meta.env.VITE_API === "real"`, then `fetch("/api/…")`.
  `ops` rejects with `ApiError { status: 409 | 422, body: Conflict | Unprocessable }`.
- Queries: `useSnapshot()`, `useIssue(id?: string)`, `useLibraryItem(id?)`, `useGlossary()`, `useSearch(q, scope?)`,
  `useContextBundle(id)`.
- Selectors (built on `useSnapshot`): `useAuthors(): Map<string, Author>`, `useAuthor(handle)`, `useMe(): string`
  (acting author = `config.author`), `useIssueSummary(id)`, `useIssueMap(): Map<id, IssueSummary>`,
  `useGroupTree(): GroupNode | undefined`, `useGroup(id)`, `useGroupIndex(): Map<id, GroupNode>`,
  `issuesInGroup(root: GroupNode, issues): IssueSummary[]` (whole subtree), `useInbox(): { mine: NeedsYouItem[], all: NeedsYouItem[], count: number }`.
- Writes (all optimistic, all go through `api.ops`, 409 → rollback + sonner toast
  `"goal.md changed by @codex — reapply?"` with a Reapply action; 422 → toast with first diagnostic):
  - `useMoveIssue(): { move(issue: IssueSummary, to: IssueStatus): void }` — illegal move or done gaps → opens the
    gate via `useMoveGate`; otherwise writes. "Move anyway" sends `force: true`.
  - `useMoveGate()` (zustand): `{ open, kind: "illegal"|"done_gate", issue?, to?, reason?, gaps: string[], confirm(), cancel() }`.
  - `useToggleCriterion(issueId)`, `useToggleStep(issueId)`, `useSetTaskStatus(issueId)`, `useAnswerRequest()`,
    `usePromote()`, `useApproveLibrary()`, `useNewIssue()`, `useNewGroup()` — each returns
    `(args) => Promise<OpResult | undefined>`.
- `ApiError` class.

`src/lib/live/index.ts` exports:
- `startLive(queryClient)` — called once by the shell. Subscribes to the mock event stream (or `EventSource` on
  `/api/events` when real); applies `delta` to the snapshot cache only when `rev` is newer; invalidates changed issue
  details; plays scripted activity (see below).
- `useLiveStatus(): { state: "live"|"reconnecting"|"offline", rev: string }`
- `useRecentlyChanged(id: string): boolean` — true for 1.5 s after a delta touched that issue (cards add `wf-flash`).
- `useActivity(): ActivityEvent[]` — latest 50, newest first.
- Activity toasts: only `notable` events (needs-you, blocked, expired lease), via sonner, with "Open" action.
- Optional browser notifications for blocking requests when `usePrefs().notifications` is on.

`web/mock/` contents:
- `time.ts` — `ago(minutes)`, `ahead(minutes)`, `daysAgo(d, hh, mm)` → RFC 3339 strings with `+05:30`, computed from
  the real clock at load so relative times always read naturally.
- `data/*.ts` — seed workspace (see "Mock world" below), typed with `@/gen/types`.
- `server.ts` — in-memory store; `snapshot()`, `issue(id)` (full detail for rich issues, generated detail for the rest),
  `libraryItem(id)`, `glossary()`, `search()` (simple scoring over titles/bodies), `context(id)` (markdown bundle text),
  `ops(op)` (applies to the store, bumps revs, emits `delta` + `activity`), `subscribe(fn)` event stream,
  and `mockControls`: `{ conflictNextWrite(), playNextEvent(), setArchifyAvailable(b), setConnection("live"|"reconnecting"), reset() }`
  exposed on `window.__wf`. Latency 80–160 ms.
- Scripted live events: every ~20 s the server plays the next event of a loop (codex appends a change to
  wf-3k9x2 T-3; claude-opus rewrites current_state; a new blocking needs-you request; a lease expires on another
  issue (amber); claude-sonnet moves an issue to review; …). The DevPanel can play them on demand.
- `diagrams.ts` is owned by the **diagram builder** and exports `DIAGRAMS: Record<string, Diagram>` keyed by id:
  `live-board-architecture` (architecture, goal.md of wf-3k9x2), `sse-delivery-flow` (workflow, plan.md of wf-3k9x2),
  `skills-flow` (workflow, goal.md of the skills-flowchart issue), `broken-release-flow` (status `invalid`, 2 errors).
  The data builder imports it: `import { DIAGRAMS } from "@mock/diagrams"`.

### shell builder: `src/main.tsx`, `src/app/**`

- `main.tsx` imports `@fontsource-variable/inter` and `./styles/base.css`, renders `<App/>`.
- `app/App.tsx` — QueryClientProvider, TooltipProvider, RouterProvider, `<Toaster/>`, `<MoveGateDialog/>`,
  theme + density sync (`usePrefs` → `document.documentElement.dataset`), `startLive` once, tab title
  `"(3) wf"` where 3 = my open inbox count.
- `app/router.tsx` — TanStack Router, code-based route tree per the table above; `validateSearch` for each route;
  `createHashHistory()` when `VITE_HASH_ROUTER === "1"`; register the router type.
- `app/AppShell.tsx` — grid `[NavRail | Main]`, viewport-locked. Main hosts the route outlet.
- `app/BoardLayout.tsx` — `/w` layout: root `<div className="relative flex h-full min-h-0 min-w-0">` holding
  `<div className="min-w-0 flex-1"><BoardPage/></div>` and the drawer `<Outlet/>`. The drawer route renders
  `IssueDrawer`, which is a flex item when docked and `absolute inset-y-0 right-0` when overlaid.
- `app/NavRail.tsx` — collapsible (232 ↔ 52 px; ⌘B or `[`): workspace name + acting author at top; nav items
  Board (`g w`), Inbox with count (`g i`), Library (`g l`), Kit; the `GroupTree`; footer with theme (system/light/dark),
  density, notifications toggle, ⌘K hint, `?` hint.
- `app/GroupTree.tsx` — `role="tree"`; nested groups from `useGroupTree()`; each node: color dot (group hue), title,
  roll-up count, 32 px mini progress bar (status-colored segments), needs-you dot; selecting sets board `group`.
  Implicit groups show in italic. Collapsible nodes, keyboard arrows.
- `app/CommandPalette.tsx` — ⌘K. Groups: Issues (search), Groups, Library, Actions (move open issue to…, new issue,
  new group, toggle theme, density, go to inbox/board/library/kit, simulate conflict, play live event).
- `app/ShortcutsDialog.tsx` — `?`. Lists every shortcut from contract §6 with `Kbd`.
- `app/NewIssueDialog.tsx` — `n`: group picker, slug (auto from title), title, template (default|bug|research|doc), size.
  Calls `useNewIssue()`; opens the new issue.
- `app/DevPanel.tsx` — a small "Prototype" pill bottom-left; opens controls: play next live event, simulate conflict
  on next write, archify available toggle, connection state, reset data, jump to Kit. Hidden behind `.` key too.
- `app/shortcuts.tsx` — global hotkeys: ⌘K, ⌘B, `[`, `g w`, `g l`, `g i`, `g k` (kit), `n`, `?`.

### board builder: `src/features/board/**`

`index.ts` exports `BoardPage`. Files: `BoardPage.tsx`, `BoardToolbar.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`,
`Swimlane.tsx`, `IssueCard.tsx`, `dnd.ts`, `useBoardKeys.ts`, `filter.ts`.
- Toolbar (44 px): group breadcrumb (from `group` search), swimlanes toggle (child groups | none), author filter
  (AuthorStack + menu), text filter (`/` focuses), "Show cancelled", count summary, "New issue" button.
- 6 columns (`BOARD_COLUMNS`), cancelled only with `show=cancelled`. Column width `var(--wf-col-w)`. Backlog and Done
  fold to a 36 px vertical rail (`usePrefs().foldedColumns`) showing the vertical label + count; click to unfold.
  Columns scroll horizontally inside the board; each column body scrolls vertically; virtualize above 40 cards
  (`@tanstack/react-virtual`). Card order: priority, then last activity.
- Swimlanes: when `swim=child` (default when the selected group has child groups), one collapsible band per direct
  child group (color dot, title, roll-up), issues directly in the selected group go in a "No subgroup" band.
  Drops across swimlanes are disabled (visibly: no drop indicator, `not-allowed` cursor).
- Drag (pragmatic-drag-and-drop): drop into another column → `useMoveIssue().move` (optimistic; the gate dialog
  handles illegal moves and the done gate). Drop indicator: accent 2 px line + column highlight.
- `IssueCard` anatomy: title (2-line clamp, 13 px medium); relative group path (faint, 11 px); 14 px `ProgressRing`
  top-right; then signal chips **only when present**: needs-you (accent, count), blocked (danger), stale (amber),
  lease holders (`AuthorStack`), lint dot. Priority glyph (urgent/high only) before the title. On hover/focus:
  a footer line "3/8 tasks · 2 ready" and the last-activity time. Selected (open in drawer) = accent hairline.
  `useRecentlyChanged` → `wf-flash`. Context menu / "…" button: Move to…, Open in new page, Copy link.
- Keyboard: `j/k` move card focus, `h/l` move column, Enter opens drawer, `o` full page, `s` opens the status menu
  of the focused card, `/` filter, `n` new issue (shell handles), Esc closes drawer.

### issue-frame builder: `src/features/issue/{index.ts, IssueDrawer.tsx, IssuePage.tsx, IssueView.tsx, IssueHeader.tsx, tabs/FilesTab.tsx, DocsList.tsx, DocView.tsx, LintPanel.tsx}`

`index.ts` exports everything public of the issue feature: `IssueDrawer, IssuePage, IssueView, IssueHeader,
StateSnapshot, NeedsYouList, CriteriaChecklist, CoverageStrip, PlanLanes, PlanList, TaskPill, ChangesTimeline,
DecisionCards, LearningCards, DocsList, DocView, LintPanel`. (Write it immediately with the paths below even
before the other files exist.)
- `IssueDrawer({ id })` — `docked` (≥1600): a right panel inside BoardLayout's flex row, width `usePrefs().drawerWidth`,
  draggable left edge (440–760). `overlay` (768–1599): a sheet over the board with `shadow-pop`, click-outside closes.
  Esc closes (`useCloseIssue`). Contains `IssueView variant="drawer"`.
- `IssuePage({ id })` — full page: top bar with breadcrumb + back to board; `IssueView variant="page"`.
- `IssueView({ id, variant })` — loads `useIssue(id)`; skeleton while loading; header; then:
  - drawer: `Tabs` `Now · Goal · Plan · Log · Files` (`useIssueTab`), each tab panel scrolls independently;
    counts on tabs (needs-you on Now, criteria verified/total on Goal, tasks done/total on Plan, entries on Log,
    files + lint on Files). Number keys 1–5 switch tabs.
  - page: three independently scrolling columns `[Now + Goal] [Plan] [Log]`; Files and lint reachable from the header
    (a "Files" button opening a Sheet with `FilesTab`). Below 768 px the page falls back to the tab layout.
- `IssueHeader({ detail, variant })` — id (mono, copyable), title (16 px semibold), `StatusSelect`, priority, size,
  owner, coordinator lease (AuthorChip + "lease 34m left" or amber "lease expired"), labels, due, `LintBadge`,
  buttons: Open in new page ↗ (`o`), Copy link, Copy `wf context` command, Close (drawer only).
- `tabs/FilesTab.tsx` `FilesTab({ detail })` — `DocsList` + `LintPanel`.
- `DocsList({ docs, onOpen })`, `DocView({ doc })` (markdown via MarkdownProse; images inline; other files: size + open raw).
- `LintPanel({ diagnostics })` — grouped by file, severity icon, rule id (mono), message, "line 12" jump link
  (copies `path:line`), fix hint.
- Tab components from other builders, all with props `({ detail: IssueDetail, variant: "drawer" | "page" })`:
  `tabs/NowTab.tsx → NowTab`, `tabs/GoalTab.tsx → GoalTab`, `tabs/PlanTab.tsx → PlanTab`, `tabs/LogTab.tsx → LogTab`.

### issue-now-goal builder: `src/features/issue/{tabs/NowTab.tsx, tabs/GoalTab.tsx, StateSnapshot.tsx, NeedsYouList.tsx, CriteriaChecklist.tsx, CoverageStrip.tsx}`

- `NowTab({ detail, variant })` — `StateSnapshot`; empty state when `state` is null (skill `write-current-state`).
- `StateSnapshot({ state: CurrentState, detail: IssueDetail })` — summary line (14 px, the hero); "updated 12m ago by
  @claude-opus" with staleness tint (amber when older than `issue_hours` or `summary.signals.state_behind_changes`
  → "behind 3 changes"); `NeedsYouList` with inline answer box; In flight with `TaskPill`s; Blocked (danger left
  hairline); Next steps numbered, item 1 emphasized as "Next"; Done, Handoff notes, Failed attempts collapsed
  (Collapsible, with counts). Word count warning when >400 (Q008).
- `NeedsYouList({ items: NeedsYouItem[], issueId })` — each: kind icon, question, from → to, urgency chip
  (blocking = accent), asked time, ref link, options as buttons (approve/reject) or a textarea for question/input;
  submit → `useAnswerRequest()`; answered items show "Answered by @shruti · waiting for `wf resolve`".
- `GoalTab({ detail, variant })` — Context (MarkdownProse with diagrams), Success criteria (`CriteriaChecklist` +
  `CoverageStrip`), Out of scope, Links, unknown frontmatter keys (F006) as faint key/value rows. When
  `goal.frontmatter_ok` is false: show the F001 finding banner and the raw file in a mono block with the error line
  highlighted (this is SC-2 in the dogfood issue).
- `CriteriaChecklist({ criteria, issueId })` — header with `ProgressRing` (size 28, label) and "2 verified · 1 claimed
  · 5"; each row: criterion checkbox (open/claimed hatched/verified solid), `SC-n` mono, the EARS sentence with
  keywords in faint small caps (`ears.keywords` spans), chips: `verify` (mono command or "manual"), `evidence` (link),
  freeform/not measurable warnings (S07/S08) as faint chips; toggling → `useToggleCriterion`; expanding a row
  shows scenario and verified_by.
- `CoverageStrip({ criteria, tasks })` — one compact row per SC: which tasks satisfy it (TaskPills); uncovered
  criteria flagged (Q006 info).

### issue-plan builder: `src/features/issue/{tabs/PlanTab.tsx, PlanLanes.tsx, PlanList.tsx, TaskPill.tsx, TaskDetail.tsx}`

- `PlanTab({ detail, variant })` — Approach (MarkdownProse with diagrams), Assumptions (A-n with open/confirmed),
  Prior art (RefLinks), then the plan view with a `Segmented` toggle Lanes | List (`usePrefs().planView`) and a
  "Ready: 2" highlight toggle. Plan header: revision, updated by/at. Empty state when `plan` is null
  (skill `write-plan`; for size xs/s say a plan is optional).
- `PlanLanes({ plan, criteria })` — rows = lanes, columns = dependency levels (`task.level`); `TaskPill`s placed in
  cells; dependency edges drawn as SVG curves **only** for the hovered/selected task (its deps and dependents);
  ready tasks get an accent ring when the Ready highlight is on; lane labels at left (sticky). Horizontal scroll inside.
- `PlanList({ plan })` — phase stepper: each phase a row with progress; finished phases collapsed; tasks as rows with
  status glyph, id, title, claimant, steps x/y, lane chip.
- `TaskPill({ task: Task, size?: "sm"|"md", onClick?, selected? })` — `StatusIcon` + `T-3` mono + title (truncate) +
  claimant avatar; lease expired → amber dot; stale → amber; ready → accent dot. Used by Now and Goal too.
- `TaskDetail({ task, issueId })` — Popover (lanes) or inline (list): brief, steps checkboxes (`useToggleStep`),
  depends_on, owns (mono), satisfies, verify, lease, status menu (`useSetTaskStatus`).

### issue-log builder: `src/features/issue/{tabs/LogTab.tsx, ChangesTimeline.tsx, DecisionCards.tsx, LearningCards.tsx}`

- `LogTab({ detail, variant })` — `Segmented` Changes | Decisions | Learnings with counts (`useIssueTab().log`).
- `ChangesTimeline({ changes, issueId })` — sorted by ts desc; grouped by day with sticky day headers; a vertical
  rail with author-hue dots (agent = rounded square, human = circle); per entry: kind glyph, title (13 px medium),
  author, relative time, task/criteria chips, result pass/fail chip, commit/pr/files chips (mono), body
  (MarkdownProse compact, collapsed beyond 3 lines). `failure` entries and `result: fail` in danger tone;
  `answer` entries show Q and A. Filter chips by author and kind at top.
- `DecisionCards({ decisions, issueId })` — ADR cards: status chip (proposed/accepted/rejected/superseded), title,
  **Decision** first and prominent, Because, Consequences, Revisit when; Rejected collapsed; superseded decisions fold
  under their successor ("supersedes D-…" chain, expandable); topic chip; affects SC chips; decided_by authors;
  Promote button (opens `PromoteDialog` from `@/features/library`).
- `LearningCards({ learnings, issueId })` — kind icon (tip/gotcha/pattern), the rule in bold, evidence (≤3 lines),
  tags; `promote: candidate` → "Promote" button (PromoteDialog); `promoted_to` → "In library ↗" link.

### diagram builder: `src/features/diagram/**`, `web/mock/diagrams.ts`, `web/public/diagrams/**`

`index.ts` exports `ArchifyCard, DiagramDialog`.
- Render real diagrams with the archify CLI (skill at `~/.claude/skills/archify`, read its SKILL.md):
  write candidate JSON for the 3 valid diagrams, run `node ~/.claude/skills/archify/bin/archify.mjs finalize <type>
  candidate.json out.html --quality showcase --json` (in a temp dir), inject the bridge script (≈20 lines: a
  ResizeObserver posts `{type:"wf:size", h}` to parent; a `message` listener for `{type:"wf:theme", theme}` sets the
  theme without reload), save as `web/public/diagrams/<id>.html`. `Diagram.url` = `/diagrams/<id>.html`
  (relative-safe for static builds: build it as `${import.meta.env.BASE_URL}diagrams/<id>.html`).
- `web/mock/diagrams.ts` exports `DIAGRAMS` (see data builder) with real `source` JSON, `nodes` counts, titles.
- `ArchifyCard({ diagram: Diagram, compact?: boolean })` — card with title, type chip, node count, "Open" button;
  body height `clamp(220px, 32vh, 420px)`, iframe `src={url + "?embed=1&theme=" + theme}`,
  `sandbox="allow-scripts"`, mounted only when an IntersectionObserver sees the card; listens for `wf:size` to grow up to
  the cap; posts `wf:theme` on theme change. States: rendering (skeleton), invalid (error list with JSON paths, the JSON
  source in a mono block, "Copy for agent" = errors + source), unavailable (JSON source + hint "Run `wf doctor`").
  Click/Open → `DiagramDialog`.
- `DiagramDialog({ diagram, open, onOpenChange })` — fullscreen dialog, iframe without `embed`,
  `sandbox="allow-scripts allow-downloads"`, header with title, type, source location (`plan.md:40`), copy JSON.

### library-inbox builder: `src/features/library/**`, `src/features/inbox/**`

`library/index.ts` exports `LibraryView, LibraryItemView, PromoteDialog`. `inbox/index.ts` exports `InboxView`.
- `LibraryView` — header with tabs Items | Glossary; Items: facets (kind, status, tags) at left, search (server
  `useSearch(q, "library")`), list of item rows (kind icon, title, "Use when…" description, status chip
  (draft = outline, reviewed = success, retired = faint strike), used by N, review overdue amber); selecting opens
  `LibraryItemView` in a right pane (`/lib/$id`). Glossary: term list with kind, means, avoid (struck synonyms → term),
  see links; a "Check text" box is optional.
- `LibraryItemView({ id })` — title, kind, status, description, sections by kind (Rule/When to use/Example/Evidence …),
  source backlinks (RefLinks to the entries it came from), backlinks panel "Used by N issues", reviewed_by,
  review_after (amber when past), actions: Approve (draft → reviewed via `useApproveLibrary`), Retire (disabled stub).
  Draft items show a banner: "Draft — not injected into agent context until reviewed".
- `PromoteDialog({ open, onOpenChange, issueId, entry: LearningEntry | DecisionEntry })` — kind (prefilled from the
  entry: gotcha/pattern/tip→pattern, decision→decision), slug (auto), preview of the draft item, dedupe suggestion
  ("Similar: lib-… — merge instead?" when the mock search finds a close title), Create draft → `usePromote()`;
  explains that a review request goes to the group owner.
- `InboxView` — the needs-you inbox across the workspace: tabs Mine | All | Answered; rows: urgency, kind icon,
  question, issue title (opens the issue), from → to, asked time, options as inline buttons / answer box
  (`useAnswerRequest`); blocking first; empty state "Nothing needs you". Notification opt-in banner for blocking
  requests (uses `usePrefs().setNotifications` + `Notification.requestPermission`).

## Mock world (data builder; others may rely on these ids)

Workspace "wf" (`id_prefix = "wf"`), acting author **shruti**. Authors (`authors.md`):
- `shruti` human, Shruti Joshi, color 1, lanes web, skills
- `claude-opus` agent, claude-code, model claude-opus-5-5, color 7, coordinator
- `codex` agent, codex, color 2, lanes server, core
- `claude-sonnet` agent, claude-code, model claude-sonnet-5-5, color 3, lanes web
- `cursor-bot` agent, cursor, color 4, lanes web
- `mudit` human, color 5, lanes core

Groups (root = `issues/`, implicit title "Issues"):
- `g-wf001` **wf** (owner shruti, color 7) → children `g-core1` **core** (color 2), `g-web01` **web** (color 1),
  `g-skl01` **skills** (color 3); plus issue `wf-b1d7v` "Build v1" directly in wf.
- `g-plat1` **platform** (color 4) → `g-auth1` **auth** (color 8, nested) → issue `wf-ss0lo` "SSO login".
- `docs/` implicit group (no `_group.md`, color by hash) with non-code issues (user guide, research notes).

The rich dogfood issue **`wf-3k9x2` "Live board updates"** in `issues/wf/web/live-board-updates`: status
in_progress, priority high, size m, owner shruti, coordinator claude-opus (live lease). Criteria SC-1…SC-5 (SC-1, SC-2
verified, SC-3 claimed, SC-4, SC-5 open). Tasks T-1…T-5 across lanes core, server, web in 3 phases (T-1 done, T-2
review, T-3 in_progress claimed by codex with steps 1/2, T-4 todo + ready, T-5 todo blocked by deps). current_state
with a blocking needs-you request `Q-4m2pz` to shruti ("Approve keeping SSE instead of WebSocket for the board?",
ref D-7f3k2). ~10 changes over 2 days incl. a `failure` and a `verify` pass; decisions incl. `D-7f3k2` accepted
"Push board updates over SSE" superseding an earlier "Poll the snapshot every 2 s"; 3 learnings (one promoted to
`lib-4tz7c`, one candidate). Docs: `notes/research.md`, `evidence/sc2.png`. Diagrams `live-board-architecture`
(goal.md) and `sse-delivery-flow` (plan.md). A couple of S/Q lint findings.

About 20 more issues across all statuses and groups showing every signal at least once: needs-you blocking and fyi,
blocked (with `blocked_by`), stale (amber), lease expired, done-but-criteria-unmet drift, in_progress without plan,
xs issue without plan, bad YAML (`wf-7yq2m` "Fix tab-title count": F001, raw file view), cancelled, many lint
warnings, due dates, labels. Plus ~8 library items (all kinds; draft, reviewed, retired, overdue) and the glossary
seed terms (contract 1.4 + §2).
