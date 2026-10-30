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

**The mock world is markdown.** The data behind the prototype is a real `wf` workspace of
markdown files, `web/mock/workspace/`, and nothing else (see "Markdown first" below). To change
what the board shows, edit a file there, or open **Workdatabase · Files** in the UI. Never add a
TypeScript object that holds content.

**The shipped workspace is empty of issues.** `web/mock/workspace/` holds the config, authors,
glossary, the library and the six groups (`wf`, `core`, `web`, `skills`, `platform`, `auth`), and no
issues: the board starts as a clean slate. The sample world (26 issues, every signal, the diagrams
and the files the Kit and the tests name) is kept in `web/mock/sample/`, a fixture and not shipped
content. **Load sample data** (DevPanel, or `window.__wf.loadSample()`) puts it on the board; **Reset
data** goes back to the empty workspace; the **Kit** shows it while `/kit` is open. Every example id
in this file (`wf-3k9x2` and so on) is an issue of the sample.

## Naming: workspace, workflow, workdatabase

The words below are the product's vocabulary. Use them in UI copy, code comments, the Kit and
feedback; the user quotes them.

```
Workspace: wf            the container: workspace name, groups, workflow.toml
├─ Workflow              work in motion         sub-views: Board · Inbox
└─ Workdatabase          everything stored      sub-views: Library · Glossary · Files
```

- A **view** is Workflow or Workdatabase; a **sub-view** is one page of it (Board, Inbox, Library,
  Glossary, Files). Say "Workflow · Board", "Workdatabase · Files". "Workspace files" is now
  "Workdatabase · Files" (the nav and the top bar say just "Files").
- **One top bar per page.** Each sub-view page starts its 44 px top bar with `ViewTabs`
  (`@/components/common`): the view's name and icon, a faint separator, then the sub-views as
  real links (underline tabs; under 900 px the name gives way to the icon, under 420 px the icon goes too; counts: Inbox = my open requests, accent when above zero; Library =
  items; Glossary = terms; Files = files, with a red lint dot when any file has errors). The
  page's own controls follow (filters, search, actions) and stay visually secondary. The Board,
  its drawer (`/w/i/$id`) and the full issue page (`/i/$id`) all count as Board.
- The **Groups** tree in the nav rail filters the Workflow board; it belongs to neither view.
- **Kit** (`/kit`, `g k`) is the prototype's own tooling, not a view. It sits near the footer of
  the nav.
- Page and tab titles: `(3) Workflow · wf`, `Workflow · Inbox · wf`, `Workdatabase · wf` (Library),
  `Workdatabase · Glossary · wf`, `Workdatabase · Files · wf`, `Kit · wf`; 3 = my open inbox count.
  A view's home sub-view (Board, Library) is not named in the title; the others are.

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
  shadow-pop rounded-sm|md|lg font-mono`. Also in the vocabulary: `text-stale-text` and
  `text-success-text` (amber and green as *readable text*, the signal color pulled toward the text
  color; `text-stale` stays for dots, fills and borders), `text-on-hue` (text on a hue tile),
  `bg-scrim` (the dim layer behind dialogs, the palette and the phone nav), `code-inline` (inline code
  on the type scale: 12 px, 11 px inside a container that sets `--wf-code-size`) and the named layers
  `z-raised z-overlay z-dialog z-popover z-tooltip` (10 / 40 / 50 / 60 / 70). Never write a
  `color-mix()` for amber or green text in a feature, and never a raw z-index that stacks against
  another component: pick a layer. Small local numbers (`z-[1]` to `z-30`) only order the children of
  one component (a sticky head, the drawer's click-away layer). Font sizes: `text-xs` 11, `text-sm` 12,
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
| `/inbox` | Workflow · Inbox: `InboxView` | |
| `/lib` | Workdatabase · Library: `LibraryView` (three layout modes, see its section) | `kind, q` (`?tab=glossary` redirects to `/glossary`, keeping `q`) |
| `/lib/$id` | `LibraryView` with `LibraryItemView id` open | `kind, q` |
| `/glossary` | Workdatabase · Glossary: `GlossaryPage` from `@/features/library` (renders its own top bar with `ViewTabs`) | `q` |
| `/files` | Workdatabase · Files: `WorkspaceView` (tree + source of every workspace file; edit, create, delete) | `path` (workspace-relative, kept exactly as typed), `line` (scroll to and flash that line) |
| `/kit` | `KitPage` (component gallery) | |

Every route renders inside the one `AppShell`. `subViewForPath(pathname)` (`@/components/common`) is
the single place that says which sub-view a path belongs to (`/w`, `/w/…` and `/i/…` → Board);
`ViewTabs`, the `NavRail` and the tab title all use it.

Features navigate only through `useOpenIssue`, `useCloseIssue`, `useBoardSearch`,
`useIssueTab`, `useGo` from `@/lib/nav` (`/glossary` has no `useGo` helper: use a `Link` or `useNavigate`); the Files feature has `useFilesNav` and
`filesHref` (`@/features/files`). Hash routing is used when `VITE_HASH_ROUTER=1`
(`/#/files?path=…`, as in the static build).

## Module map and public APIs

### ui-common builder: `src/components/ui/**`, `src/components/common/**`

`src/components/ui/index.ts` re-exports (shadcn-style, restyled to the tokens):
- `Button({ variant?: "primary"|"secondary"|"ghost"|"subtle"|"danger", size?: "sm"|"md"|"icon"|"icon-sm", ...button props })`
  — md = h-7, sm = h-6, icon = 7×7, icon-sm = 6×6. primary = accent bg; secondary = hairline.
- `IconButton({ label: string, icon: ReactNode, size?: "sm"|"md", ...})` — ghost icon button with tooltip = label.
- `Dialog, DialogTrigger, DialogContent({ title, description?, size?: "sm"|"md"|"lg"|"full", hideClose?, children }), DialogFooter, DialogClose`
  — scrim is `bg-scrim` at `z-dialog`. `DialogFooter` is **sticky**: pinned to the bottom edge of a dialog whose body scrolls, so
  the actions stay in reach on a phone (`z-raised`, hairline above).
- `Sheet({ open, onOpenChange, side?: "right", width?: number, children, title })` — non-modal-looking overlay panel with `shadow-pop` at `z-overlay`.
- `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem({ icon?, shortcut?, disabled?, hint? }), DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent`
- `Popover, PopoverTrigger, PopoverContent`, `HoverCard, HoverCardTrigger, HoverCardContent`
- `Tooltip({ content: ReactNode, side?, shortcut?: string, children })` and `TooltipProvider`
- `Tabs, TabsList, TabsTrigger({ count?: number }), TabsContent` — underline tabs, 13 px, count chip.
- `Segmented<T extends string>({ value: T, onChange(v: T), options: { value: T, label: ReactNode, count?: number, icon?: ReactNode }[], size?: "sm"|"md", "aria-label": string })`
- `Checkbox({ checked, onCheckedChange, variant?: "default"|"criterion", state?: "open"|"claimed"|"verified", disabled?, "aria-label"? })`
  — criterion variant: claimed = hatched fill, verified = solid fill with check.
- `Input`, `Textarea`, `SearchInput({ value, onChange, placeholder, shortcut?: "/" })` — the key cap shows while the field is empty and
  unfocused, and only from 768 px (a phone has no `/` key; the placeholder gets the room back).
- `Kbd({ combo: string })` — uses `comboKeys()`; `Kbd` renders small mono key caps.
- `Chip({ tone?: "neutral"|"accent"|"danger"|"stale"|"success"|"outline", icon?, size?: "xs"|"sm", children, title?, onClick?, pressed? })`
  — with `onClick` it is a button (`pressed` shows the on state; 28 px tall on a phone).
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
  — quiet; shows "Run the `write-plan` skill" and a copyable `wf …` command when given. It sizes the icon itself (14 px): callers pass the
  bare icon.
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
- `SourceLineMarker({ path, line, … })` — the quiet tag ("library/gotchas/rescan-subtrees.md:14") that a rendered block shows in the page's left
  gutter on hover; it opens that line in Workdatabase · Files, or wherever its owner's `onJump` sends it. `CodeBlock({ code, lang?,
  highlightLine?, maxHeight?, compact? })` — mono block; the marked line has a 2 px `border-danger` left bar (a real `border-l-2`, the
  same bar `JsonSource` uses), never an inset shadow.
- `ViewTabs({ view: "workflow" | "workdatabase", className? })` — the sub-view tabs of a view as real links (`Link`,
  `aria-current="page"` on the active one), after the view's name and icon. Workflow: Board · Inbox (accent count above
  zero); Workdatabase: Library · Glossary · Files (counts, lint dot when a file has errors). Also exports `VIEWS`,
  `SUBVIEWS` (label, route, shortcut per sub-view), `subViewForPath(path)`, `useActiveSubView()`, `useViewCounts()`.
- `CopyButton({ text, label })`
- `MoveGateDialog()` — rendered once by the shell. Reads `useMoveGate()` from `@/lib/api`. Two modes:
  illegal move ("backlog → done is not an allowed move…" + "Move anyway") and done gate (lists `gaps`,
  "Move to Done anyway"). Primary action calls `confirm()`.
- `Toaster()` — sonner, themed with tokens, bottom-right, max 3.
- `Glyph` helpers: `KindIcon({ kind: ChangeKind | LearningKind | LibraryKind, size? })` — one lucide icon per kind.

### data builder: `web/mock/**`, `src/lib/api/**`, `src/lib/live/**`

`src/lib/api/index.ts` re-exports:
- `queryClient` (TanStack Query client)
- `api` — `{ snapshot(), issue(id), libraryItem(id), glossary(), search(q, scope?, k?), context(id, budget?), ops(op),
  files(), file(path), writeFile({ path, text, base_rev? }), deleteFile({ path, base_rev? }) }`.
  Uses the in-memory mock server (`@mock/server`) unless `import.meta.env.VITE_API === "real"`, then `fetch("/api/…")`
  (the file calls are prototype endpoints beyond contract §1.10: `GET /api/files`, `GET|PUT|DELETE /api/files/{path}`).
  `ops` rejects with `ApiError { status: 409 | 422, body: Conflict | Unprocessable }`.
- Queries: `useSnapshot()`, `useIssue(id?: string)`, `useLibraryItem(id?)`, `useGlossary()`, `useSearch(q, scope?)`,
  `useContextBundle(id)`, `useWorkspaceFiles(): UseQueryResult<WorkspaceFileInfo[]>` (sorted by path, stale on every
  delta), `useWorkspaceFile(path?): UseQueryResult<WorkspaceFile>` (disabled without a path).
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
    `usePromote()`, `useApproveLibrary()`, `useNewIssue()`, `useNewGroup()`, `useAddLinks()` (adds `## Links` bullets to goal.md: the
    "Add context" button) — each returns
    `(args) => Promise<OpResult | undefined>`.
  - `useWriteWorkspaceFile(): (args: { path, text, base_rev? }) => Promise<{ rev } | undefined>` — saves a whole file;
    toasts 409/422/other itself and resolves `undefined`. `useDeleteWorkspaceFile(): (args: { path, base_rev? }) => Promise<void>`
    — throws `ApiError`/`NotFoundError`, the caller explains. (Plain functions: `writeWorkspaceFile`, `deleteWorkspaceFile`.)
- `ApiError` class.

`src/lib/live/index.ts` exports:
- `startLive(queryClient)` — called once by the shell. Subscribes to the mock event stream (or `EventSource` on
  `/api/events` when real); applies `delta` to the snapshot cache only when `rev` is newer; invalidates changed issue
  details and marks the file queries stale; plays scripted activity (see below).
- `useLiveStatus(): { state: "live"|"reconnecting"|"offline", rev: string }`
- `useRecentlyChanged(id: string): boolean` — true for 1.5 s after a delta touched that issue (cards add `wf-flash`).
- `useActivity(): ActivityEvent[]` — latest 50, newest first.
- Activity toasts: only `notable` events (needs-you, blocked, expired lease), via sonner, with "Open" action.
- Optional browser notifications for blocking requests when `usePrefs().notifications` is on.

#### Markdown first: how `web/mock/` works

**The files are the source of truth.** `web/mock/workspace/` (shipped: groups, library, glossary, no issues) and
`web/mock/sample/` (the sample world, a full copy of the former workspace) are real `wf` workspaces (`wf_format = 1`): `workflow.toml`,
`authors.md`, `glossary.md`, `issues/<group path>/<slug>/{goal,plan,current_state,changes,decisions,learnings}.md` with
docs and assets, `issues/**/_group.md`, `library/<kind>s/<slug>.md`. The grammar is `docs/plan/contract.md` §1.2–1.7.
Diagrams are archify blocks inside `goal.md` / `plan.md` (` ```archify <type> id=<id> `). Read the folder's own
`README.md` first. Nothing else describes the mock world: there is no TypeScript seed, and `mock/data/**`,
`mock/diagrams.ts` and `mock/serialize.ts` no longer exist.

```
mock/workspace/**  ──(Vite glob ?raw / ?wf-asset)──▶  workspace-files.ts  DISK   (shipped, recording-frame files)
mock/sample/**     ──(same globs)────────────────▶  sample-files.ts     SAMPLE (fixture)
                                                         │  HMR: self-accepting, publishDisk() / publishSample()
                                                         ▼  workspace-bus.ts
store.ts  working copy: Record<path, text>  ◀── applyDisk() / applySample(): shift by the store's clock, skip echoes
          reset() = back to DISK · loadSample() = SAMPLE in one commit · holdSample() = SAMPLE now, the working copy back later
   │ every commit:  rebaseWorkspace (at load/reset)  →  md/loadWorkspace(files)  →  derive(source)  →  delta + activity
   ▼
server.ts  (snapshot, issue, libraryItem, glossary, search, context, ops, files, file, writeFile, deleteFile, events)
```

- **`mock/md/` — the markdown layer.** `loadWorkspace(files, { binary?, now? }): LoadedWorkspace` parses the files the way the
  daemon does and never throws (bad input becomes findings). It returns the sources `derive()` needs (`world`), the raw
  `texts` per issue file, `diagnostics` per path (all **F** and **S** lint rules computed from the text, `[lint]` config
  applied), `anchors` (line and byte span of every SC-n, T-n, Q-xxxxx, entry id and frontmatter key), `diagrams`, `assets`.
  The parser replaces each archify block in the API prose by a ` ```wf-diagram\n<id>\n``` ` fence, like the daemon.
  Files: `parse-*.ts` (one per file kind), `frontmatter.ts`, `blocks.ts`, `lint.ts` + `checks.ts` + `prose.ts` (rules),
  `render.ts` (sources → canonical text), `edit.ts`, `rebase.ts`, `templates.ts`.
- **`derive.ts`** turns a `LoadedWorkspace` into the API shapes of `@/gen/types` (snapshot, `IssueDetail`s, library, signals,
  inbox). Revs, line numbers, word counts and every `EditRef` come from the real text. F and S findings come from the loader;
  the **Q** rules (state versus goal: drift, stale, lease, needs-you) stay in `derive` and respect `[lint]` disable and severity.
  `src/gen/types.ts` is unchanged by all this, so the UI cannot tell where the data came from.
- **`store.ts`** keeps the working copy of the files (path → text) in memory. `mutate(by, issue, fn)` hands the caller a draft;
  the caller edits text; only when the edited files load and derive does the store swap them in, bump the rev and emit a
  `delta` plus the `activity` events the write declared. 409 checks use the anchor's rev (`guard`) or the file's rev
  (`guardFile`). A write that throws leaves the store untouched. `reset()` goes back to the shipped files as they are on disk
  now (empty of issues). `loadSample()` replaces the working copy with the sample files as one commit: a single `resync`, no
  activity line per file, nothing of the old copy kept. `holdSample()` is for a screen that needs the sample (the Kit): the
  first hold saves the working copy (texts, assets, activity log, file history) and loads the sample, nested or repeated holds
  only count, and the last release puts the saved copy back exactly. `reset()` during a hold gives the pristine sample.
- **Every write is a minimal text edit** (`md/edit.ts`, like `wf-edit`'s splice). `ops.ts` maps each Op to edits and `events.ts`
  does the same for the 8 scripted live events (`SCRIPT`, one every ~20 s, played from the DevPanel too). The events target
  sample issues (`EVENT_TARGETS`), so on the empty shipped workspace every one is skipped without a sound (no edit, no activity,
  no toast) and the DevPanel's "Play next event" says so quietly. Ticking SC-3 flips
  `[ ]` to `[x]` on that line of `goal.md` and changes nothing else; unticking also drops that criterion's `evidence` and
  `verified_by` lines; `set_status` changes one `status:` line; `answer_request` ticks the box and adds `answer:`,
  `answered_by`, `answered_at`; `new_issue` creates one `goal.md`; `promote` creates a library file and appends the review
  request to `current_state.md`. Files are never re-serialized (two contract-defined overwrites aside). `mock/ops.test.ts`
  asserts the line diff of every Op.
- **The watcher (dev server).** `mock/workspace-files.ts` globs the folder and accepts its own HMR update. When a file under
  `mock/workspace/` is saved, added or removed, it hands the new file set to `store.applyDisk` through `workspace-bus.ts`
  (while the sample is on screen the shipped files only wait for `reset()`). `mock/sample-files.ts` does the same for
  `mock/sample/` through `store.applySample`, which applies it only while the sample is loaded and otherwise keeps it for the
  next "Load sample data".
  The store applies only what differs from its working copy, as one commit: re-parse, delta, card fade, and an activity line
  `@<author or disk> edited goal.md` (the author is taken from a new entry heading when there is one). A file whose text the
  store already holds is an echo and is ignored. A change to `authors.md`, `glossary.md` or `workflow.toml` also emits
  `resync`, because those are not part of a delta. The Vite plugin `workspaceHot` (`vite.config.ts`) keeps an add or a
  remove from reloading the page: the update is the watcher module alone. Browser edits survive a disk change and are never
  written back to disk.
- **The file API (`mock/files.ts`, `server.ts`).** `files()` lists every workspace file with `kind`, bytes, rev, owning
  `issue`/`group`/`library` and the error, warning and info counts; `file(path)` returns the text (or the asset URL) and the
  file's diagnostics; `writeFile` and `deleteFile` take an optional `base_rev` (409 with `"goal.md changed by @x"` or
  `"…changed on disk"`; 422 for a bad path, a binary file, more than 1 MB or a workspace that cannot be read afterwards; 404
  for a missing file). Saving a file re-loads the whole workspace, so a new `goal.md` is a new card and a broken
  frontmatter is F001 with the raw file shown.
- **Times: `RECORDED_AT`.** The files hold absolute times, written once at `RECORDED_AT` (`mock/md/recorded-at.ts`). At load
  and on `reset()` the store calls `rebaseWorkspace(files, shiftSinceRecording(now))`: every RFC 3339 timestamp anywhere in
  the text moves by `now − RECORDED_AT` (rounded to whole minutes, offset and precision kept) and every date-only value of
  `due`, `created`, `last_reviewed`, `review_after` moves by the matching number of local days. "12m ago" stays "12m ago",
  a lease 40 min ahead stays 40 min ahead, on any day. The files on disk never change by this. A time typed by hand into a
  file on disk is shifted like the rest (write it relative to `RECORDED_AT`); a time typed in the Files editor
  is taken as is, because the editor shows the working copy. `time.ts` has the formatters (`toTs`, `toDate`, `nowTs`, `dateIn`).
- **Diagrams.** The loader finds the archify blocks, validates them (valid, or `invalid` with JSON-path errors, F011) and
  returns a `Diagram` per block. A valid one is `ready` with a `url` only when the archify switch is on
  and a stand-in preview page exists for its id (`mock/diagram-previews.json`, pages in `public/diagrams/<id>.html`);
  otherwise it is `unavailable` with its JSON source. **The switch starts off** (archify is not installed in this world, so the
  first thing a diagram card shows is the honest unavailable state). Two controls turn it on and off: the DevPanel's "Archify
  available" switch, and the unavailable card's own "Prototype: show the stand-in preview" button (it calls
  `setArchifyAvailable(true)`; the DevPanel switch follows the snapshot). `mock/store.ts` `archify` option: default `false`. `node scripts/render-diagram-previews.mjs` redraws the pages from
  the archify blocks of both folders (the shipped workspace first, then the sample; the diagrams live in the sample, so the
  three previews stay), writing only what differs; the dev server runs it again when a file with a block changes in either.
- **Lint.** Findings carry the file, line and column of the text. Implemented: F001–F014, F016, F017, S01–S03, S05–S09, S11,
  S13 (see `md/lint.ts`, `md/checks.ts`, the parsers), plus an inline `<!-- wf-lint-disable S06 -->`. `[lint] disable = ["S09"]`
  in `workflow.toml` is on purpose (the web issues say "card"); delete it to see S09 appear.
- **Not representable in files.** `IssueSrc.activity` (status moves, tick and lease activity) has no file form: UI ops keep it
  in memory (`Applied.log`) so cards can still read "Moved to Review" until `reset()`.
- **Tests** read the files as they ship: `mock/md/*.test.ts` (grammar of every file, the declared findings, tolerant reader,
  edits, rebase, templates), `mock/world.test.ts`, `mock/ops.test.ts`, `mock/files.test.ts`, `mock/server.test.ts`. A large
  hand edit of the workspace can break a test that names an issue by id; fix the test or the edit.
- **`window.__wf`** (`mockControls`): `{ conflictNextWrite(), playNextEvent(), setArchifyAvailable(b), setConnection("live"|"reconnecting"|"offline"), reset() }`.
  Latency 80–160 ms.

### shell builder: `src/main.tsx`, `src/app/**`

- `main.tsx` imports `@fontsource-variable/inter` and `./styles/base.css`, renders `<App/>`.
- `app/App.tsx` — QueryClientProvider, TooltipProvider, RouterProvider, `<Toaster/>`, `<MoveGateDialog/>`,
  theme + density sync (`usePrefs` → `document.documentElement.dataset`), `startLive` once, tab title
  `"(3) Workflow · wf"` (see Naming) where 3 = my open inbox count; `tabTitle(path, workspace, count)` lives in `app/tab-title.ts`.
- `app/router.tsx` — TanStack Router, code-based route tree per the table above; `validateSearch` for each route;
  `createHashHistory()` when `VITE_HASH_ROUTER === "1"`; register the router type.
- `app/AppShell.tsx` — grid `[NavRail | Main]`, viewport-locked. Main hosts the route outlet. `RailSlot` is the rail's grid cell:
  below 1100 px it is the 52 px icon rail (see NavRail) and, when opened, the full rail floats over the page in the same 52 px cell
  (no page jump) with a click-away layer, both at `z-overlay`. Below 768 px a top bar (`MobileTopBar`: menu, name, Prototype, search)
  opens `MobileNavSheet`, a modal sheet on `bg-scrim` (`z-overlay`) with the rail inside (`z-dialog`). A skip link ("Skip to
  content") sits at `z-popover`.
- `app/BoardLayout.tsx` — `/w` layout: root `<div className="relative flex h-full min-h-0 min-w-0">` holding
  `<div className="min-w-0 flex-1"><BoardPage/></div>` and the drawer `<Outlet/>`. The drawer route renders
  `IssueDrawer`, which is a flex item when docked and `absolute inset-y-0 right-0` when overlaid.
- `app/NavRail.tsx` — 232 px, or the 52 px icon rail. Wide screens (1100 px and up): collapsible by the saved choice (⌘B or `[`).
  **768 to 1099 px: always the icon rail** whatever was saved (`useNavRail`, `NARROW_RAIL_QUERY`), so a tablet in portrait keeps its page
  width; ⌘B, `[` and the expand button then open the full rail as an overlay that is saved nowhere. Content: a faint "Workspace" label
  above the workspace name ("wf"), the mark, the acting-as avatar and the live badge at top; then the views: **Workflow** (LayoutGrid
  icon, the accent Inbox count on it) with indented sub-items Board (`g w`) and Inbox (`g i`, count), **Workdatabase** (Database icon;
  `g d`) with Library (`g l`), Glossary (`g g`), Files (`g f`), each with a faint count; then the **Groups** tree (it filters the Workflow
  board); then Kit (`g k`, prototype tools) beside the Prototype pill; footer with theme (system/light/dark), density, notifications
  toggle, ⌘K hint, `?` hint. Icon rail: one icon per view, tooltips list the sub-views. The phone sheet mirrors the expanded rail.
  Active states follow the route (`useActiveSubView`).
- `app/GroupTree.tsx` — `role="tree"`; nested groups from `useGroupTree()`; each node: color dot (group hue), title,
  roll-up count, 32 px mini progress bar (status-colored segments), needs-you dot; selecting sets board `group`.
  Implicit groups show in italic. Collapsible nodes, keyboard arrows.
- `app/CommandPalette.tsx` — ⌘K. Result groups in order: Issues ("Recent issues" while the field is empty), Groups, Library, Glossary
  (a term opens `/glossary?q=<term>`), Files (opens the file), Actions. Actions: new issue, new group, move open issue to…, open it as a
  full page, "Edit goal.md of <open issue>", copy `wf context`, "Workflow · Board", "Workflow · Inbox", "Workdatabase · Library",
  "Workdatabase · Glossary", "Workdatabase · Files", "Kit (prototype tools)", theme, density, sidebar, shortcuts, simulate a conflict,
  play the next live event.
- `app/ShortcutsDialog.tsx` — `?`. Lists every shortcut from `SHORTCUTS` in `app/shortcuts.tsx` with `Kbd`; sections General, Go to,
  Workflow · Board, Issue, Workdatabase · Files. Go to rows: "Workflow · Board" `g w`, "Workflow · Inbox" `g i`, "Workdatabase · Library"
  `g l` or `g d`, "Workdatabase · Glossary" `g g`, "Workdatabase · Files" `g f`, "Kit" `g k`.
- `app/NewIssueDialog.tsx` — `n`: group picker, slug (auto from title), title, template (default|bug|research|doc), size, and a
  "Context from the Workdatabase" field (`ContextPicker`, see the context section) with a preview of what the agent will receive and
  the file that will be created. Calls `useNewIssue()`; opens the new issue.
- `app/RouteStates.tsx` — `RouteError`: "This view failed to load", the message, **Try again** (`router.invalidate()` then the
  boundary's `reset()`; it does not reload the page, so the mock's in-memory edits survive), Copy details, Go to Workflow.
  `RouteNotFound`.
- `app/DevPanel.tsx` — a small "Prototype" pill bottom-left (expanded nav; an icon in the icon rail and the phone bar); opens controls:
  play next live event, connection state, simulate conflict on next write, **archify available** (off by default; the unavailable
  diagram card's "Prototype" button turns it on and the switch follows), **Reset data** (back to the shipped files: groups,
  library, no issues), **Load sample data** (the 26 sample issues in one commit; toast "Loaded 26 sample issues"), open
  Workdatabase · Files, jump to Kit. "Play next event" says "No live events apply here. Load sample data to play them." when
  no scripted event fits the workspace. Toggled by the `.` key too.
- `app/shortcuts.tsx` — global hotkeys: ⌘K, ⌘B, `[`, `g w` Workflow (Board), `g i` Inbox, `g d` Workdatabase (Library),
  `g l` Library, `g g` Glossary, `g f` Files, `g k` Kit, `n`, `?`, `.`.

### board builder: `src/features/board/**`

`index.ts` exports `BoardPage`. Files: `BoardPage.tsx`, `BoardToolbar.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`,
`Swimlane.tsx`, `IssueCard.tsx`, `dnd.ts`, `useBoardKeys.ts`, `filter.ts`.
- Toolbar (44 px, the Board's one top bar): `ViewTabs view="workflow"` first, then the group breadcrumb (from `group` search)
  and the count summary (container queries: the summary needs 1280 px of board width; the breadcrumb shows its whole
  chain from 1152 px and only the current scope below that, the full path in its tooltip), swimlanes toggle (child groups | none), author filter
  (AuthorStack + menu), text filter (`/` focuses), "Show cancelled", count summary, "New issue" button.
- 6 columns (`BOARD_COLUMNS`), cancelled only with `show=cancelled` (when the column appears the board scrolls it into view: a link
  that opens with it jumps, the toggle glides; at 1440 px the columns before it are then partly off to the left, inside the board's own
  scroll container). Column width `var(--wf-col-w)`. Backlog and Done
  fold to a 36 px vertical rail (`usePrefs().foldedColumns`) showing the vertical label + count; click to unfold.
  Columns scroll horizontally inside the board; each column body scrolls vertically; virtualize above 40 cards
  (`@tanstack/react-virtual`). Card order: priority, then last activity.
- Swimlanes: when `swim=child` (default when the selected group has child groups), one collapsible band per direct
  child group (color dot, title, roll-up), issues directly in the selected group go in a "No subgroup" band.
  Drops across swimlanes are disabled (visibly: no drop indicator, `not-allowed` cursor).
- Drag (pragmatic-drag-and-drop): drop into another column → `useMoveIssue().move` (optimistic; the gate dialog
  handles illegal moves and the done gate). Drop indicator: accent 2 px line + column highlight.
- `IssueCard` anatomy: title (2-line clamp, 13 px medium) with the 14 px `ProgressRing` top-right; under it the **id row**: the relative
  group path (faint, truncates) on the left, and at the right one quiet cluster in a fixed order: lint dot, lease holders
  (`AuthorStack`), priority glyph (urgent: filled danger tile with "!"; high: three bars; others nothing), then the mono id. Priority sits
  here, not before the title, so every title shares one left edge. Then signal chips **only when present** (wrapping, never clipped):
  needs-you (accent, count), blocked (danger), stale / lease expired (amber). Selected (open in drawer) = accent hairline.
  `useRecentlyChanged` → `wf-flash`.
  **Hover footer = an overlay.** `data-wf="IssueCardFooter"` is `absolute` on the card's bottom edge and grows from 0 with
  `grid-template-rows` (`0fr` to `1fr`), so the card never changes height and nothing below it moves while the pointer sweeps down a
  column. It shows "3/8 tasks · 2 ready", the last-activity author and time, and the "…" menu (Move to…, Open in new page, Copy link).
  One card shows it at a time: the hovered one while the pointer was the last input, the focused one while the keyboard was; the board
  root carries `data-input="pointer|keyboard"` (set by `useBoardKeys`) for that. The footer covers the card's last row while open. Below
  768 px and on `(hover: none)` screens there is no hover, so the footer is a plain, always-open last row in the flow.
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
- `IssueView({ id, variant })` — loads `useIssue(id)`; skeleton while loading; "Issue <id> not found" (with "Back to board") when
  the read is a 404, also when the issue was open and then vanished (Reset data, leaving the Kit, a deleted folder): a failed
  background refetch keeps the cached copy on screen, except a `NotFoundError`; header; then:
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
  (copies `path:line`), fix hint, and "Edit at this line": `useEditAtLine()` calls `useFilesNav().edit(path, { line })`, so the editor opens with
  the caret and the scroll on that line (`EditIntent.line`). The Goal tab's F001 banner "Fix in editor" does the same.
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

### diagram builder: `src/features/diagram/**`, `web/public/diagrams/**`

`index.ts` exports `ArchifyCard, DiagramDialog`.
- Render real diagrams with the archify CLI (skill at `~/.claude/skills/archify`, read its SKILL.md):
  write candidate JSON for the 3 valid diagrams, run `node ~/.claude/skills/archify/bin/archify.mjs finalize <type>
  candidate.json out.html --quality showcase --json` (in a temp dir), inject the bridge script (≈20 lines: a
  ResizeObserver posts `{type:"wf:size", h}` to parent; a `message` listener for `{type:"wf:theme", theme}` sets the
  theme without reload), save as `web/public/diagrams/<id>.html`. `Diagram.url` = `/diagrams/<id>.html`
  (relative-safe for static builds: build it as `${import.meta.env.BASE_URL}diagrams/<id>.html`).
- The diagram sources are the archify blocks in the workspace's `goal.md` / `plan.md` files (`live-board-architecture` and
  `sse-delivery-flow` in wf-3k9x2, `skills-flow` in the skills flowchart issue, the invalid `broken-release-flow` in wf-g5rx8).
  The loader (`mock/md/`) turns them into `Diagram`s with real `source` JSON, `nodes` counts and titles;
  `node scripts/render-diagram-previews.mjs` draws the three valid ones into `public/diagrams/<id>.html`.
- `ArchifyCard({ diagram: Diagram, compact?: boolean })` — card with title, type chip, node count, "Open" button;
  body height `clamp(220px, 32vh, 420px)`, iframe `src={url + "?embed=1&theme=" + theme}`,
  `sandbox="allow-scripts"`, mounted only when an IntersectionObserver sees the card; listens for `wf:size` to grow up to
  the cap; posts `wf:theme` on theme change. The full-size open button covers the frame, so it forwards its wheel events as
  `{ type: "wf:scroll", dy }` and a page taller than the card scrolls in place (the stand-in pages handle the message; a real archify
  page needs the same in its bridge). States: rendering (skeleton while the lazy chunk or the iframe loads), invalid (error list with
  JSON paths, the JSON source in a mono block, "Copy for agent" = errors + source), unavailable (JSON source + hint "Run `wf doctor`" and the
  "Prototype: show the stand-in preview" button, which switches archify on for the whole prototype). Click/Open → `DiagramDialog`.
- `DiagramDialog({ diagram, open, onOpenChange })` — fullscreen dialog, iframe without `embed`,
  `sandbox="allow-scripts allow-downloads"`, header with title, type, source location (`plan.md:40`), copy JSON.

### library-inbox builder: `src/features/library/**`, `src/features/inbox/**`

`library/index.ts` exports `LibraryView, LibraryItemView, GlossaryPage, GlossaryView, MarkdownDocument, PromoteDialog`. `inbox/index.ts` exports `InboxView`.
- `LibraryView` — Workdatabase · Library (the Glossary is its own page, `/glossary`, `GlossaryPage`): one 44 px top bar (`ViewTabs` first), then
  facets (kind, status, review overdue, tags), search (server `useSearch(q, "library")`, `/` focuses it) and the list of item rows (kind icon,
  title, "Use when…" description, status chip (draft = outline, reviewed = success, retired = faint strike), used by N, review overdue amber);
  selecting a row opens `LibraryItemView` (`/lib/$id`). **Three layout modes, by the measured width of the page** (the rail counts as page;
  `useElementWidth` on the root):
  - **1100 px and up, docked:** facets, list and item side by side; the pane is 520 to 640 px (40% of the page).
  - **860 to 1099 px, beside the list:** an open item takes the facets' place; the facets become filter chips above the list
    (`LibraryFilterChips`), the item sits beside it, the list keeps its status column and at least 360 px.
  - **under 860 px (and on a phone): its own screen.** An open item replaces the list; "← Library" goes back. On a phone the facets are
    the filter chip row (it scrolls sideways on purpose) under a full-width search.
  The list never sits half under the item.
- `LibraryItemView({ id, variant?: "pane" | "screen" })` — a toolbar (kind, status chip, **Rendered | Source** switch, **Edit**, Close), a
  path row, the draft / retired / overdue banners ("Draft — not injected into agent context until reviewed"), then the page: the file
  rendered from its markdown (`MarkdownDocument`: frontmatter as properties, every section in file order, each block tied to its
  source line with a `SourceLineMarker`), where it came from (RefLinks; a `source:` entry the server could not resolve, such as a
  sample issue in the empty workspace, still shows from the file's own frontmatter as a dangling reference with "Not in this
  workspace", never as "No source recorded"), "Used by N issues", Approve (draft → reviewed via
  `useApproveLibrary`), Retire (disabled stub). **Source** shows `SourceView embedded` edge to edge under the toolbar, with lint
  markers. **Edit edits inline, in either view**: it calls `requestFileEdit({ path })` (the source view starts its editor in place; the
  person never leaves the Library), shows Edit as taken while the editor is open (`onEditingChange`), returns focus to the Edit button after
  a save or cancel (`returnFocusTo`), and refuses a switch of view with a toast while an edit is open. "Open in Files" is a link in the
  source meta line.
- `GlossaryPage` (`/glossary`) — a 44 px top bar (`ViewTabs`, then a search box; the filter lives in `?q=`) over `GlossaryView`: the terms
  read from `glossary.md`, each with its kind, meaning, the avoided synonyms struck through with an arrow to the term, and a "See:" list whose
  entries are buttons (24 px hit area, 28 px on a phone) that jump to that term; every term names its source line and opens it in
  Workdatabase · Files.
- `PromoteDialog({ open, onOpenChange, issueId, entry: LearningEntry | DecisionEntry })` — kind (prefilled from the
  entry: gotcha/pattern/tip→pattern, decision→decision), slug (auto), preview of the draft item, dedupe suggestion
  ("Similar: lib-… — merge instead?" when the mock search finds a close title), Create draft → `usePromote()`;
  explains that a review request goes to the group owner.
- `InboxView` — Workflow · Inbox, the needs-you inbox across the workspace: `ViewTabs` at the left of the top bar, a
  Mine | All | Answered filter (segmented control) at the right; rows: urgency, kind icon,
  question, issue title (opens the issue), from → to, asked time, options as inline buttons / answer box
  (`useAnswerRequest`); blocking first; empty state "Nothing needs you". Notification opt-in banner for blocking
  requests (uses `usePrefs().setNotifications` + `Notification.requestPermission`).

### workspace-files builder: `src/features/files/**` (+ View source in `features/issue/{tabs/FilesTab,DocsList,DocView}.tsx`)

The prototype's way to see and change the markdown the board is built from. Route `/files?path=<workspace-relative path>[&line=n]`;
a Workdatabase sub-view: nav item "Files" (`g f`); palette "Workdatabase · Files" and "Edit goal.md of <open issue>"; a button in the DevPanel.
There is no "Prototype" chip on the page (the top bar's one-line explanation has a tooltip that says edits stay in the browser tab).
`index.ts` exports `WorkspaceView`, `WorkspaceTree`, `SourceView`, `SourceEditor`, `NewFileDialog`, `useFilesNav`, `FilesLink`, `filesHref`,
`requestFileEdit`, `ISSUE_FILE_NAMES`, `issueFileTemplate`, `templateForPath`, `type FilesSearch`; `@/app/search` has `validateFilesSearch`.
- `WorkspaceView({ path? })` — 44 px top bar (`ViewTabs` for the Workdatabase, a one-line explanation from 1360 px, "New file"), a 280 px tree at
  the left and `SourceView` at the right. **Single-screen layout under 720 px of page width** (measured on the view's root, so the rail counts
  as page; not a viewport query): the tree and the file are separate screens with a back arrow. A 280 px tree leaves 440 px for a file, which
  is the least the source needs.
- `WorkspaceTree({ selectedPath?, onSelect, onNewFile?, className? })` — `role="tree"`. Issue folders show the issue's
  `StatusIcon`, title and a faint slug; group folders their color dot (italic when implicit); root files sit under "Workspace";
  the library lists its kinds in a fixed order. A file with findings has a dot and count; a collapsed folder rolls up its
  children. Folders default open down to issue level and open down to the selected file. The filter matches path, issue title
  or issue id. Arrow keys, Home/End, Enter.
- `SourceView({ path, variant?: "pane" | "inline", pathLabel?, onBack?, onDeleted?, line?, defaultView?: "source" | "rendered",
  showViewToggle?, embedded?, returnFocusTo?, onEditingChange?, className? })` — header with the mono path and copy button, rev, size,
  line count, a one-line note on what the file drives, "Open issue" / "Open library item" / "Open group", Edit and a ⋯ menu (copy path, copy
  text, Delete with a confirm dialog). The text has line numbers, light highlighting (tokens only; archify fences marked) and a gutter
  marker per finding (tooltip `S06 · message Fix: …`); "N findings" cycles through them. **Wrap:** prose (markdown) wraps and the line numbers
  stay one per file line; code and settings (toml, json) scroll sideways; a wrap switch in the meta line (and in the editor) flips it.
  A markdown file can also be read as the page it renders to (**Rendered | Source** switch; `defaultView`, `showViewToggle={false}` for a host
  that has its own switch). Images show with their size, other binaries get a "no preview" state, a missing path "No file at …" with
  "Create this file". `workflow.toml` is editable (saving it re-applies `[lint]`, leases and staleness).
  `embedded`: edge to edge in a host that has its own header (the Library item pane): no path row, no card border, the text fills the
  height; the meta line stays, with a link to the file in Files. The host starts an edit with `requestFileEdit({ path })`, says where focus
  returns after a save or cancel (`returnFocusTo`, its own Edit button) and hears when the editor opens or closes (`onEditingChange`,
  to show that button as taken). `line` scrolls to and flashes a line once the text is on screen (in the pane, `?line=` does the same).
- Edit mode (`SourceEditor`, rendered by `SourceView`) — a mono textarea with the same metrics as the view (on a phone the whole editor box,
  its gutter and wrap mirror included, is 16 px so iOS does not zoom on focus; line height stays `--wf-src-lh`). Save is ⌘S / ⌘↵ with
  `base_rev`, Cancel is Esc, an "Unsaved" dot shows when edited. On success the toast reads "Saved goal.md · the board re-read it" with an
  "Open board" action, and the view returns scrolled to the first changed line with the changed lines faded. If the file's rev
  moved past the one the editor opened from, a bar says "This file changed while you edited it" (Reload / Overwrite). Esc on a
  dirty draft asks "Discard?"; leaving the route with a dirty draft opens a dialog (`useBlocker`, no `window.confirm`).
- **Edit intent** (`intent.ts`): `requestFileEdit({ path, draft?, append?, h1?, select?, line? })` asks the `SourceView` of `path` to open its
  editor within 15 s. `draft` is a starting text (a template), `append` an entry added at the bottom, `select` text to select (a title
  placeholder), `line` the 1-based line to put the caret and the scroll on ("Fix in editor", lint "Edit at this line"). `useFilesNav().edit(path,
  intent)` requests the edit and opens the file.
- `NewFileDialog({ open, onOpenChange, defaultGroup?, defaultIssue?, onCreated, onEdit })` — templates "New issue (goal.md)"
  (title, group folder, slug; writes a valid backlog `goal.md` with a fresh `wf-xxxxx` id), "Change entry" (opens the issue's
  `changes.md` with a new entry appended and its title selected) and "Empty file". The path input is always visible and
  validated (workspace-relative, `.md` or `.toml`, no `..`, no ignored folders, no duplicates). It also takes context from the Workdatabase.
- Issue Files tab — every issue file and doc row has "View source" (inline `SourceView`, with Edit and "Open in Files"); a missing issue file
  has "Create", which opens the editor with a starting text. `DocView` has "View source" too.
- Data: only `useWorkspaceFiles`, `useWorkspaceFile`, `useWriteWorkspaceFile`, `useDeleteWorkspaceFile` from `@/lib/api`.
  The editor never holds data of its own; what you save is read back through the same loader as a file saved on disk.

### context builder: `src/features/context/**`

Context from the Workdatabase: library items, glossary terms, files and decisions an agent should read with an issue. `index.ts` exports
`ContextPicker` (a field with removable chips and an "Add" button that opens a command-style search right under it, in the flow of the form: used
by the New issue and New file dialogs), `ContextSearch`, `ContextPreview` (what the agent will get, against a token budget; draft library items
are marked "not injected until reviewed"), `AddContextButton` (the Goal tab's Links section: a pick is written at once with `useAddLinks`),
`LinkedContext` (the `## Links` bullets as rows, with remove-and-undo), `LinkedPreview`, `useWorkdatabase` (the pickable list, built from the same
queries as the Library, Glossary and Files views) and the link grammar (`links.ts`: `linkLine`, `parseLinkLine`, `parseLinks`).

### kit builder: `src/features/kit/**`

`/kit` is the component gallery (not a view): a left index and one section per element, so the user can review element by element and answer
as "ElementName: change". `?el=<ComponentName>` opens the page at that element's section (for example `/kit?el=IssueCard`); `?view=side` shows
light and dark side by side. Entries live in `entries/*.tsx`, one `entry(...)` per `data-wf` name. Foundations shows the tokens live (surfaces,
accent and signals, readable signal text, scrim and the z scale, status colors, the hue scale). The "hover footer (forced open)" board variant
forces the footer open with a selector on `IssueCardFooter`; the real footer is an overlay on the card's last row, and so is this one.
The kit names real issues by id (`wf-3k9x2` and so on), and the shipped workspace has none, so `KitPage` holds the sample while the
route is open: on mount it saves the user's working copy and loads the sample (`mockControls.holdSample()`), on unmount it puts the
saved copy back exactly. The hold is counted in the store, so StrictMode and repeated visits cannot corrupt it. What an element
writes in the kit (Edit, Create, Delete) goes to the sample copy and is gone when the kit closes. The user's saved prefs are not touched.

## Mock world (the sample folder; others may rely on these ids)

These are the files under `web/mock/sample/` (not objects in code): the sample world. The shipped `web/mock/workspace/` keeps
its config, authors, glossary, library and `_group.md` files and has none of the issues below (Library items there point at
sample entries, so each shows a dangling reference, F009, until the sample is loaded: 18 F009 warnings and one Q013 info, no
error). Workspace "wf" (`id_prefix = "wf"`), acting
author **shruti**. Authors (`authors.md`):
- `shruti` human, Shruti Joshi, color 1, lanes web, skills
- `claude-opus` agent, claude-code, model claude-opus-5-5, color 7, coordinator
- `codex` agent, codex, color 2, lanes server, core
- `claude-sonnet` agent, claude-code, model claude-sonnet-5-5, color 3, lanes web
- `cursor-bot` agent, cursor, color 4, lanes web
- `mudit` human, color 5, lanes core

Groups (root = `issues/`, implicit title "Issues"):
- `g-wf001` **wf** (owner shruti, color 7) → children `g-core1` **core** (color 2), `g-web01` **web** (color 1),
  `g-skl01` **skills** (color 3); plus issue `wf-b1d7v` "Build v1" directly in wf.
- `g-plat1` **platform** (color 4) → `g-auth1` **auth** (color 8, nested) → issue `wf-ss0lo` "Add SSO login".
- `docs/` implicit group (no `_group.md`, color by hash) with non-code issues (user guide, research notes).

The rich dogfood issue **`wf-3k9x2` "Push board updates over SSE"** in `issues/wf/web/live-board-updates`: status
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
