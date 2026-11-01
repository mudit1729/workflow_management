# wf web UI: build contract (prototype on mocks)

This file is the integration contract for the parallel UI build. Every builder
follows it exactly. The product contract is `docs/plan/contract.md` (§1.10 API,
§1.11 frontend, §1.12 tokens, Part 3 §6 UI). If this file and the product contract
disagree, the product contract wins; note the conflict in your final report.

Goal: a clickable prototype of every UI element, running on mock data, so the user
can review each element and give feedback. It must look finished: calm, precise,
Linear-like. It is also the real `web/` codebase, so write production-quality code.

The product goals behind the screens (plan `docs/plan/proposals/codex-workflow-plan.md`): (1) distribute skills and plugins across the team
(Library · Skills), (2) hand anyone the full context of an issue (the Now, Goal, Criteria, Plan, Log, Git, CI and Files tabs, the Open in Codex
button and **Copy context**, which copies the context bundle as markdown), (3) keep issues and tasks traceable (task ↔ commit ↔ CI run, every change a markdown diff).

**The mock world is markdown.** The data behind the prototype is a real `wf` workspace of
markdown files, `web/mock/workspace/`, and nothing else (see "Markdown first" below). To change
what the board shows, edit a file there, or open **Library · Files** in the UI. Never add a
TypeScript object that holds content. The one thing that is not markdown is git, pull request and CI data: in the product it is
derived from git and GitHub and never stored in the workspace (plan D2), so the prototype reads a fixture
(`mock/fixtures/delivery-sample.json`) and what a Codex run adds.

**The shipped workspace is empty of issues.** `web/mock/workspace/` holds the config, authors,
glossary, the library and the six groups (`wf`, `core`, `web`, `skills`, `platform`, `auth`), and no
issues: the board starts as a clean slate. The sample world (26 issues, every signal, the diagrams
and the files the Kit and the tests name) is kept in `web/mock/sample/`, a fixture and not shipped
content. **Load sample data** (DevPanel, or `window.__wf.loadSample()`) puts it on the board; **Reset
data** goes back to the empty workspace; the **Kit** shows it while `/kit` is open. Every example id
in this file (`wf-3k9x2` and so on) is an issue of the sample.

## Naming: workspace, workflow, library (the old Workdatabase)

The Workdatabase is now the **Library** (spec: `docs/plan/proposals/libraries-spec.md`). The view's id in code is still `workdatabase`
(`WfView`), its label is "Library"; older paragraphs below that say "Workdatabase" mean this view.

The words below are the product's vocabulary. Use them in UI copy, code comments, the Kit and
feedback; the user quotes them.

```
Workspace: wf            the container: workspace name, groups, workflow.toml
├─ Workflow              work in motion         sub-view: Board (with its Needs you filter)
└─ Library               everything stored      sub-views: Personal · Team libraries · Files · Skills  (id `workdatabase`; the Glossary is a page of the workspace library)
```

| word | means | where it shows |
|---|---|---|
| **Workflow** | work in motion | nav view, top bar name, tab title |
| **Board** | the one Workflow sub-view: the issues as columns, with its filters | `/w`, drawer `/w/i/$id`, full page `/i/$id` |
| **Needs you** | a board filter: only the issues that have an open request for the acting person. It replaces the inbox | toolbar toggle with a count, `/w?needs=me`, palette "Workflow · Needs you" |
| **Library** | markdown libraries read as a document wiki: **Personal** (`/lib/me`), **Team libraries** (`/lib/t/<alias>`, the workspace's own first), then **Files** and **Skills** | `/lib`, `/lib/me`, `/lib/t/<alias>`, `/files`, `/skills` |
| **Glossary** | one page of the workspace library (`glossary.md`) | `/lib/t/<workspace>/glossary.md`; `/glossary` redirects |
| **Skills** | the plugins and skills of the repository and how a team installs them (goal 1: distribute skills) | `/skills` |
| **Add work** | the one way in: a group that Codex splits into issues, or one issue | the toolbar's `+ Add work`, `n`, palette "Add work…" |
| **Open in Codex / Do next step** | the two Codex buttons beside each other: copy the command, or let Codex do the next ready task in the background | issue header, card menu, palette |
| **Criteria · Git · CI** | the issue tabs added next to Goal and Log (see "issue tabs") | `?tab=criteria`, `git`, `ci` |
| **Kit** | the prototype's own component gallery, not a view | `/kit`, `g k` |

- A **view** is Workflow or Library; a **sub-view** is one page of it (Board; Personal, Team libraries,
  Files, Skills). Say "Workflow · Board", "Library · Files". "Workspace files" is now
  "Library · Files" (the nav and the top bar say just "Files"). **There is no inbox**: no route (`/inbox`
  redirects to `/w?needs=me`), no nav item, no shortcut, no sub-view. A request that waits on you shows on its
  card, in the issue's Now tab and behind the Needs you filter.
- **One top bar per page.** Each sub-view page starts its 44 px top bar with `ViewTabs`
  (`@/components/common`): the view's name and icon, a faint separator, then the sub-views as
  real links (underline tabs; under 900 px the name gives way to the icon, under 420 px the icon goes too; counts: Personal =
  pages; Team libraries = libraries; Files = files, with a red lint dot when any file has errors; Skills = skills). The
  page's own controls follow (filters, search, actions) and stay visually secondary. The Board,
  its drawer (`/w/i/$id`) and the full issue page (`/i/$id`) all count as Board.
- The **Groups** tree in the nav rail filters the Workflow board; it belongs to neither view.
- **Kit** (`/kit`, `g k`) is the prototype's own tooling, not a view. It sits near the footer of
  the nav.
- Page and tab titles: `(3) Workflow · wf`, `Library · wf` (the home), `Library · Personal · wf`, `Library · Team libraries · wf`,
  `Library · Files · wf`, `Library · Skills · wf`, `Kit · wf`; 3 = my open needs-you requests (no count at
  zero). A view's home sub-view (Board, Library) is not named in the title; the others are.
- **The user's rule for every control:** buttons are preferred over multiple choice, multiple choice over
  drop-down menus, drop-down menus over typing. Add work asks one question per screen and types only one line (a lone issue's criterion is drafted by Codex and can be edited with a button).
- **UI and skills are two doors to the same markdown.** The UI should usually work without Codex, and Codex
  must be able to replicate the flow with the `plugins/workflow` skills without the UI. Both only ever make
  minimal text edits to the workspace files, so either can continue the other's work (see `features/skills`).

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
  into chaos. **Empty states are quiet and offer, in this order, a button (when the dashboard can do the job), then the one skill of the workflow plugin that does the same
  job without the dashboard** (`SkillHint`: the skill reference linking to `/skills?skill=<ref>`, the prompt Codex is asked, and a copy button for `codex '<prompt>'`). **The skill a hint names is the one the skills flow runs for that step** (`<SkillHint step="plan" …/>`, `useFlowSkill(step)`): the built-in one unless Settings chose another.
  **UI hints name only real things**: the skills of `plugins/workflow/skills` (`using-wf`, `adding-work`, `planning-issues`, `doing-next-step`, `logging-work`,
  `handing-off`, `checking-status`, `writing-readable-bulk-text`; `WF_SKILLS` in `features/issue/skill-hint.tsx`), a skill of the workspace, a team library or my library that a flow step names, and buttons that exist. Never invent a skill name
  (`write-plan` and `log-change` were such names), and never show a `wf …` command as something to run: there is no `wf` binary. At most say "with the wf CLI later".
  **Buttons before multiple choice before drop-downs before typing** (the user's own order) applies to every new control.
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
| `/w` | `BoardLayout` → `BoardPage` | `group, swim, author, q, show, needs` (`needs=me` is the Needs you filter) |
| `/w/i/$id` | `BoardLayout` → `BoardPage` + `IssueDrawer id` | board search + `tab, log` |
| `/i/$id` | `IssuePage id` | `tab, log` |
| `/inbox` | **gone**: redirects to `/w?needs=me`, so an old link still lands on the filter | |
| `/lib` | Library home: `LibraryHome` (a card per library, then the pages opened last) | `q, scope` (`?tab=glossary` redirects to the Glossary page, `q` opens it at that term) |
| `/lib/me`, `/lib/me/$` | the personal library: `WikiView alias="me"` (home: `PersonalHome`; a page: the splat is its root-relative path) | `q, scope, view` (`view=source`) |
| `/lib/t`, `/lib/t/$alias`, `/lib/t/$alias/$` | `/lib/t` redirects to the workspace library; otherwise `WikiView` of a team library (home page, or an overview drawn from the tree), or one of its pages | `q, scope, view` |
| `/lib/$id` | old address of a library item (`lib-xxxxx`): redirects to its page in the workspace library; an unknown id goes to `/lib` | |
| `/glossary` | old address of the glossary: redirects to `/lib/t/<workspace>/glossary.md`; `?q=<term>` opens at that term's heading | `q` |
| `/files` | Library · Files: `WorkspaceView` (tree + source of every workspace file; edit, create, delete) | `path` (workspace-relative, kept exactly as typed), `line` (scroll to and flash that line) |
| `/skills` | Library · Skills: `SkillsView` from `@/features/skills` (the repository's plugins, this workspace's skills, each team library's and mine; how to install them; the SKILL.md of the open one) | `skill` (the open skill **by reference**: `/skills?skill=adding-work`, `?skill=ws:acme-planning`, `?skill=platform-handbook:checking-security`; a bare built-in name is its own reference, so old links work) |
| `/settings` | redirects to `/settings/flow` | |
| `/settings/flow` | Settings · Skills flow: `SettingsView page="flow"` (the flow, and the step panel beside it) | `step` (`add, plan, do, log, handoff, status, style`, `custom:<id>` or `new`), `after` (`add, plan, do, handoff`: only with `step=new`), `view=team` (the Team default view) |
| `/settings/flow/edit` | the editor of a skill: `SettingsView page="edit"` | `skill` (a reference), `to` (`ws`, `me`) + `name` (the folder of a copy: copy mode needs both), `for` (the step or `custom:<id>` that points at the copy) |
| `/settings/agent`, `/settings/workspace` | the other two Settings tabs | |
| `/kit` | `KitPage` (component gallery) | |

`tab` is one of `now, goal, criteria, plan, log, git, ci, files` (`ISSUE_TABS` in `@/lib/nav`, the order of keys 1 to 8); `log` is
`changes, decisions, learnings`. Add work is not a route: it is a dialog opened through the shell store (`openAddWork`).

Every route renders inside the one `AppShell`. `subViewForPath(pathname)` (`@/components/common`)
is the single place that says which sub-view a path belongs to (`/w`, `/w/…` and `/i/…` → Board; `/skills` → Skills; `/settings/flow[/…]` → Skills flow, `/settings/agent` → Agent, `/settings/workspace` → Workspace (the Settings view's three tabs);
`/inbox` belongs to no sub-view, the router redirects it before anything renders);
`ViewTabs`, the `NavRail` and the tab title all use it. **Lazy chunks:** the issue views (`IssueDrawer`, `IssuePage`, the whole
issue feature), the Add work dialog, `SkillsView`, `SettingsView` (one chunk for all four pages), the library viewer (`WikiView`, `LibraryHome`) and the Add team library dialog are `React.lazy` in `app/lazy-views.tsx`, so the first paint carries the shell and the board;
the browser fetches the rest when idle (`preloadViews`). The search validators of `/skills` (`features/skills/search.ts`) and of `/settings/*` (`features/settings/search.ts`) live beside the views so the router does not import them.

Features navigate only through `useOpenIssue`, `useCloseIssue`, `useBoardSearch`,
`useIssueTab`, `useGo` (`board`, `needsYou`, `library`, `libraryItem`, `issuePage`, `kit`) from `@/lib/nav` (`/glossary` and `/skills` have no `useGo` helper: use a `Link` or
`useNavigate`; the Skills feature has `useSkillsNav` and `skillHref`); the Files feature has `useFilesNav` and
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
  — quiet; shows the skill line and a copyable command when given. `skill` must be a real skill and `command` a command that runs today (`codex '…'`),
  never a `wf …` line. Issue screens leave both out and pass `<SkillHint skill prompt />` as `action`, which links the skill to its page and shows the
  prompt as wrapping text. It sizes the icon itself (14 px): callers pass the bare icon.
- `ProgressRing({ verified: number, claimed: number, total: number, size?: number (default 14), label?: boolean })`
  — solid arc = verified, hatched arc = claimed, track = border color; total 0 → dashed ring. Tooltip text
  "2 verified · 1 claimed · 5 criteria".
- `LintBadge({ counts: LintCounts, variant?: "dot"|"badge", onClick? })` — dot: 6 px, danger if errors, stale if warns, faint if info.
- `MarkdownProse({ md: string, diagrams?: Diagram[], issueId?: string, compact?: boolean, document?: "page" | "pane" | "wiki", wiki?: ProseWiki, source?, className? })`
  — react-markdown + remark-gfm + rehype-sanitize. Renders ```` ```wf-diagram\n<id>\n``` ```` via
  `ArchifyCard` from `@/features/diagram` (look up the id in `diagrams`); other code blocks as mono blocks
  (shiki lazy-loaded is optional); `[[ref]]` → `RefLink`; `@handle` → `AuthorChip variant="text"`;
  calm typography (13 px, 1.5 leading, 8 px paragraph gap, small H3/H4). **GitHub callouts** (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
  `[!WARNING]`, `[!CAUTION]`) are boxes with their name in the header in every use (`remarkCallouts` in `remark-wf.ts`; the kind rides on `data-callout`).
  **`wiki` = a page of a library** (`{ alias, path, links: PageLink[], media: Record<src, PageMedia> }`, from `LibraryPage`; read through context):
  headings get anchors (`headingsOf` in `features/library/anchors.ts`, the GitHub slug, unique per page) and a `#` link; `[[path]]`, `[[path#heading]]`,
  `[[alias:path]]`, `[[target|label]]` and relative `[text](../x.md)` links go to pages (`PageLink`, dashed with a tooltip when the page, heading or
  library is missing); an issue id or lib id keeps `RefLink`. A paragraph that is only an image, a video file (`![Demo](media/demo.webm)`) or a
  YouTube, Vimeo or Loom link becomes a `MediaFigure` / `EmbedCard` (`MarkdownMedia.tsx`; not in `compact` text). `document="wiki"`: body 15 px (16 px
  from 1280 px) at 1.65, headings 28 / 22 / 18 / 16, inline code at 0.875em.
- `MarkdownMedia.tsx` — `MediaFigure({ media, alt })` (an image with its alt as caption and click-to-zoom; a missing file or one over 25 MB
  is a quiet note, not a stalled load), `GifPlayer({ src, alt, reducedMotion? })` (plays; under `prefers-reduced-motion` the first frame on a canvas with a
  Play button; a Pause button on hover for everyone), `VideoPlayer({ src, label })` (`<video controls preload="metadata">`, never autoplay or loop),
  `EmbedCard({ embed, title?, poster? })` (the player is an iframe from `youtube-nocookie.com`, `player.vimeo.com` or `loom.com/embed`, **mounted only
  after a click**; the poster is a picture of the library, never fetched from the provider) and `parseEmbed(url)`.
- `RefLink({ target: string, issueId?: string })` — `[[wf-3k9x2]]`, `[[wf-3k9x2#D-7f3k2]]`, `[[#T-4]]`, `[[lib-4tz7c]]`;
  resolves titles from the snapshot; dangling → dashed underline + F009 tooltip.
- `GroupPath({ path: string[], className? })` — faint "wf / web".
- `SourceLineMarker({ path, line, … })` — the quiet tag ("library/gotchas/rescan-subtrees.md:14") that a rendered block shows in the page's left
  gutter on hover; it opens that line in Library · Files, or wherever its owner's `onJump` sends it. `CodeBlock({ code, lang?,
  highlightLine?, maxHeight?, compact? })` — mono block; the marked line has a 2 px `border-danger` left bar (a real `border-l-2`, the
  same bar `JsonSource` uses), never an inset shadow.
- `ViewTabs({ view: "workflow" | "workdatabase", className? })` — the sub-view tabs of a view as real links (`Link`,
  `aria-current="page"` on the active one), after the view's name and icon. Workflow: Board (no count: what waits on you is the
  board's Needs you filter); Library (`view="workdatabase"`): Personal · Team libraries · Files · Skills (counts: pages, libraries, files, skills; lint dot when a file has
  errors). The Library home (`/lib`, sub-view `library`) is the page the view's name opens, not a tab. Also exports `VIEWS`,
  `SUBVIEWS` (label, route, shortcut per sub-view: `g l` home, `g p` Personal, `g t` Team libraries), `subViewForPath(path)`, `useActiveSubView()`, `useViewCounts()`
  (`personal, team, files, skills, fileErrors`).
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
  files(), file(path), writeFile({ path, text, base_rev? }), deleteFile({ path, base_rev? }),
  delivery(id), splitWork(input, onStep?), codexRuns(issue?), startCodexRun(issue, kind), cancelCodexRun(id), skills() }`
  (the last six are the delivery, work, codex and skills additions below).
  Uses the in-memory mock server (`@mock/server`) unless `import.meta.env.VITE_API === "real"`, then `fetch("/api/…")`
  (the file calls are prototype endpoints beyond contract §1.10: `GET /api/files`, `GET|PUT|DELETE /api/files/{path}`).
  `ops` rejects with `ApiError { status: 409 | 422, body: Conflict | Unprocessable }`.
- Queries: `useSnapshot()`, `useIssue(id?: string)`, `useLibraryItem(id?)`, `useGlossary()`, `useSearch(q, scope?)`,
  `useContextBundle(id)`, `useWorkspaceFiles(): UseQueryResult<WorkspaceFileInfo[]>` (sorted by path, stale on every
  delta), `useWorkspaceFile(path?): UseQueryResult<WorkspaceFile>` (disabled without a path).
- Selectors (built on `useSnapshot`): `useAuthors(): Map<string, Author>`, `useAuthor(handle)`, `useMe(): string`
  (acting author = `config.author`), `useIssueSummary(id)`, `useIssueMap(): Map<id, IssueSummary>`,
  `useGroupTree(): GroupNode | undefined`, `useGroup(id)`, `useGroupIndex(): Map<id, GroupNode>`,
  `issuesInGroup(root: GroupNode, issues): IssueSummary[]` (whole subtree), `useInbox(): { mine: NeedsYouItem[], all: NeedsYouItem[], count: number }`
  (the name is kept for the data: the open requests of the workspace. It feeds the Needs you filter and the tab title; there is no inbox page).
- Writes (all optimistic, all go through `api.ops`, 409 → rollback + sonner toast
  `"goal.md changed by @codex — reapply?"` with a Reapply action; 422 → toast with first diagnostic):
  - `useMoveIssue(): { move(issue: IssueSummary, to: IssueStatus): void }` — illegal move or done gaps → opens the
    gate via `useMoveGate`; otherwise writes. "Move anyway" sends `force: true`.
  - `useMoveGate()` (zustand): `{ open, kind: "illegal"|"done_gate", issue?, to?, reason?, gaps: string[], confirm(), cancel() }`.
  - `useToggleCriterion(issueId)`, `useToggleStep(issueId)`, `useSetTaskStatus(issueId)`, `useAnswerRequest()`,
    `usePromote()`, `useApproveLibrary()`, `useNewIssue()`, `useNewGroup()`, `useAddLinks()` (adds `## Links` bullets to goal.md: the
    "Add context" button) — each returns
    `(args) => Promise<OpResult | undefined>`. (`useNewIssue` and `useNewGroup` stay as ops, but no dialog calls them: the New issue
    and New group dialogs are gone, and `useCreateWork` below is the way in.)
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

#### Delivery, work, codex and skills (the data layer of the Codex workflow, plan D2, D4, D6, D7)

All four sit beside the markdown ones in `src/lib/api/` and `web/mock/`, with tests (`mock/{delivery,work,codex,skills}.test.ts`,
`src/lib/api/{work,codex}.test.ts`).

- **`delivery` (`lib/api/delivery.ts`, `mock/delivery.ts`, `mock/fixtures/delivery-sample.json`).** `useDelivery(issueId?): { commits, prs, pipelines, isLoading, error }`,
  each list newest first. Git, pull request and CI data are **derived and never stored in the workspace** (plan D2): a commit belongs to an
  issue when its message has the trailer `Issue: wf-xxxxx` or its branch is named `wf-xxxxx/…`; pull requests and checks come from GitHub
  through `gh`. The prototype reads the fixture while the sample is loaded (times written at `RECORDED_AT` and shifted like the sample files)
  plus whatever a Codex run adds; the shipped workspace and every new issue start with none. The Git and CI tabs read this.
- **`work` (`lib/api/work.ts`, `mock/work.ts`).** `useSplitWork(): { split(input), steps, step, pending }` takes `{ title, outcome, size?, context[] }` and
  returns `{ issues: Proposal[] }` (3 to 5, one EARS criterion each, a one-line "why"; `SPLIT_STEPS` are the three visible progress steps; about 2 s).
  The prototype's split is deterministic (keyword families and a generic fallback; the same input always splits the same way) and written
  with `writing-readable-bulk-text`: the verb first, one shape per list. The first issue's "why" names the context the person linked, in
  full (a title is never cut mid-word; two long titles become "A and 2 more"). `useCreateWork()` takes
  `{ group: GroupId | { parent, title }, issues: WorkIssueInput[] }` (1 to 8 issues) and creates the group (`_group.md`) and every `goal.md` in **one commit**
  (one delta, one activity line). Real Codex runs `codex exec` with the `adding-work` skill.
- **`codex` (`lib/api/codex.ts`, `mock/codex.ts`).** `codexCommand(issue)` is a pure function returning `{ prompt, command }`, the text
  "Open in Codex" copies. `useCodexRuns(issueId?)` lists runs (newest first) and follows them live; `useStartCodexRun()` returns
  `{ start(issueId, "next_step"), cancel(runId) }`. A run is `{ id, issue, kind, status: running | done | failed | cancelled | nothing_ready, by, task?, task_title?, phase?, phases[], started_at, finished_at?, reason?, commit?, pipeline? }`.
  The prototype's run is a **simulated background run whose phases are real markdown edits** through the store, 2 s apart (claim: the task is
  `in_progress` with a lease; log: a change entry by `@codex`; verify: the task goes to `review` and a CI run starts and passes; done: steps
  ticked, task `done`, `current_state.md` moves on, a commit with the trailer `Issue: <id>` joins the delivery data). Each phase is visible as a markdown diff
  and reaches the board through the ordinary live stream; the run itself, its commit and its CI run have a small stream of their own
  (`subscribeCodex`). One run per issue; Cancel puts the task back in the queue. `window.__wf.setCodexPhaseMs(ms)` changes the 2 s.
- **`skills` (`lib/api/skills.ts`, `mock/skills.ts`).** `useSkills(): SkillsCatalog`, `allSkills(catalog)` and the install-command builders
  `claudeInstallCommands(plugin)`, `codexInstallCommands(plugin)`, `CODEX_INSTALL_COMMAND`. The catalog is read from the repository's own files,
  `plugins/*/skills/*/SKILL.md`, `plugins/*/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (`import.meta.glob`, so what is
  committed is what shows; the dev server lets Vite reach above `web/`).
- **`openAddWork(start?)`** is in the shell store (`app/shell-store.ts`), not in the data layer: `start` is `{ kind?: "group" | "issue", group? }`.
  `useShell` also holds `paletteOpen`, `shortcutsOpen`, `addWorkOpen`, `addLibraryOpen` (`openAddLibrary()`), `devPanelOpen`, `mobileNavOpen` and `narrowNavOpen`. The old
  `newIssueOpen`, `newGroupOpen`, `openNewIssue` and `openNewGroup` are gone.

#### The skills flow (the data layer of Settings; spec `docs/plan/proposals/skills-flow-spec.md`)

One rule, implemented twice: `wf-env.sh flow` (agents) and `resolveFlow` (the dashboard). **`web/scripts/flow-parity.test.ts` runs both over `mock/flow-fixture/` and compares them with `expected.json`**, then over edited copies of it (values an option does not take, a gone personal reference, custom steps with a bad id, `after` or order, quoted numbers, team-only keys in the wrong table). Fix a divergence on whichever side the spec does not bear out.

- **Resolver and vocabulary (`lib/api/flow.ts`, re-exported from `@/lib/api`).** `FLOW_STEPS` (`id`, `name`, `builtin`, `about`, `contract`, `anywhere`, `options` with `values`, `default`, `numeric`, `phrase`, `teamOnly`, `table`), `parseSkillRef`/`skillRef`/`skillName`/`skillWords`, `BUILTIN_SKILLS`, `LIBRARY_SKILLS`, and the pure `resolveFlow({ team, me, exists })` → `ResolvedFlow { steps, custom, problems, differs }`. The rule: mine over team over built-in, per key; the four team-only options read `FlowConfig.limits` only (`[context]`, `[staleness]`); a reference that does not resolve falls back to the built-in skill and is a `problems` entry (a personal one falls back to the built-in, not to the team's value); an unresolved custom step stays listed, flagged, and does not run; a personal custom step cannot take a team id; a number or `true` in quotes is a string, which no option takes. Text helpers: `formatFlow` (= `wf-env.sh flow`), `flowLine` (the bundle's `skills flow:` line), `flowOptionsLine`, `flowValueSummary` (a number the buttons do not offer still reads as a phrase), `flowSkillRefs` (what an agent needs installed), `customAfter`.
- **Hooks (`lib/api/flow-hooks.ts`).** `useFlow()` → `{ flow, team, config, catalog, personalProblems, loading }` (always a flow: the built-in one until the files load; refreshes on `workflow.toml`, `library.toml` and skill-file writes), `useFlowSkill(step)`, `useFlowOrigin(step)`, `currentFlow()` (for a handler that is not a component), `usePersonalConfig()` (`lib/api/library.ts`; `savePersonalConfig`).
- **Writes (`lib/api/flow-writes.ts`).** `setFlowValue`, `resetFlowValue`, `addCustomStep`, `updateCustomStep`, `removeCustomStep`, `copySkill`: each is a minimal edit of `workflow.toml` (with `base_rev`, retried once on 409) or of my `library.toml` (`api.savePersonalConfig`), resolves to `FlowSaved { undo, file, id? }` or to `undefined` after a toast, and rejects with `FlowWriteError` for a mistake the panel explains beside its controls. `undoFlowChange(token)` puts the previous text back exactly, last write first, and refuses (toast) when the file changed since. The first `[flow]` table written gets an intro comment.
- **The TOML editor (`mock/md/toml-edit.ts`, no dependency; `@mock/md/toml-edit`).** `setTomlKey`, `removeTomlKey`, `removeTomlTable`, `readTomlTable`, `listTomlTables`, `listTomlKeys`, `locateToml`: change only the lines they must, keep indent, quote style, trailing comments and every other line (a random-edit round trip is tested against smol-toml).
- **Config (`mock/md/parse-flow.ts`).** `WorkspaceConfig.flow: FlowConfig` (`steps`, `custom`, `limits`); `flow` is in `TOML_KEYS`; `renderWorkflowToml` keeps the tables. The personal file is read by `readPersonalFlow` (`mock/libraries/personal-config.ts`). **wf:lint:** F018 unknown step or key, F019 bad value (also: a step that names the built-in skill of another step), F020 a built-in or `ws:` reference that does not exist, F021 a skill of the workspace's `skills/` folder that breaks the skill rules (all warnings; documented in `docs/plan/contract.md`). The workspace's `skills/` folder is read as skills, never as issues.
- **Catalog (`lib/api/skills.ts`, `mock/skills.ts`, `mock/skill-files.ts`, `lib/api/skill-check.ts`).** A `Skill` has `source` (`built-in | workspace | library | me`), `ref` (its unique key: use it for URLs, rows and palette values), `library` (the alias), `files` and `problem` (the first `check-skills` finding). `SkillsCatalog.shelves` are this workspace's skills, each loaded team library's, and mine (`SkillShelf { source, key, name, path, url?, editable, skills }`); a team library's skills appear on adding it. `skillChoices(catalog, step | "custom")` is what a panel offers (the step's own built-in, then each shelf; a custom step gets the four library skills), `skillExists(catalog)` feeds the resolver, `installFromCommand(shelf, "codex" | "claude")` is `scripts/install-skills.sh --codex --from <folder>`. `validateSkill` is a port of `check-skills.mjs` (a test pins the same messages). `Api` gains `personalConfig()`, `savePersonalConfig({ text, base_rev? })`, `skills()` and `skillFiles(ref)`; their real-client paths are guesses (`GET|PUT /api/libraries/me/config`, `GET /api/skills`, `GET /api/skills/files?ref=`).
- **The dashboard follows the flow.** `SkillHint`/`SkillLink` take a reference or a `step`; the `ASK.*` prompts, `handoffPrompt`, the docs list (`ISSUE_FILE_STEP`) and the derived "Fix:" hints name the skill in effect (the derived ones the team's only: the mock server has no person). `ASK.addWork` also says what the Add work option `then` asks (`plan`: "Then plan every new issue."; `stop`: "Do not offer to plan them."). `resumePrompt(issue, skill?)` is word for word the old sentence with the built-in Do next step skill. The context bundle takes `[flow.handoff]`'s `budget_tokens` and `changes`, and gets a `skills flow: …` header line only when the flow differs from the built-in one (the headless `handing-off` prints the same line; `format.md` section 3). The simulated run names the Plan skill in its first phase, honors `finish` (`review`: every task ends in `review` with an approval request, the run `done` with `review`) and `commit` (`none`: no verify phase, no commit), splits a drafted plan into phases of `max_tasks`, and runs each custom step after Do next step as a phase between verify and done (`custom:<id>`, `phases[].skill`); a required step set to fail stops the run with a `kind: failure` change and a blocking request, an optional one is logged and the run goes on.
- **Scripts.** `window.__wf.setFlow(step, ref, scope?)` (one minimal edit of `workflow.toml`, or of my `library.toml`), `resetFlow()` (no `[flow]` anywhere, no failing custom step), `failCustomStep(id, fail?)`.
- **Tests.** `mock/md/toml-edit.test.ts`, `mock/md/flow.test.ts`, `mock/flow-sources.test.ts`, `mock/codex-flow.test.ts`, `src/lib/api/{flow,flow-writes,skill-check}.test.ts`, `scripts/wf-env-flow.test.ts` (the script) and `scripts/flow-parity.test.ts` (both). `flow-writes.test.ts` takes about 35 s (the mock's latency, 31 tests).

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
- **Lint.** Findings carry the file, line and column of the text. Implemented: F001–F014, F016–F021, S01–S03, S05–S09, S11,
  S13 (see `md/lint.ts`, `md/checks.ts`, the parsers), plus an inline `<!-- wf-lint-disable S06 -->`. `[lint] disable = ["S09"]`
  in `workflow.toml` is on purpose (the web issues say "card"); delete it to see S09 appear.
- **Not representable in files.** `IssueSrc.activity` (status moves, tick and lease activity) has no file form: UI ops keep it
  in memory (`Applied.log`) so cards can still read "Moved to Review" until `reset()`.
- **Tests** read the files as they ship: `mock/md/*.test.ts` (grammar of every file, the declared findings, tolerant reader,
  edits, rebase, templates), `mock/world.test.ts`, `mock/ops.test.ts`, `mock/files.test.ts`, `mock/server.test.ts`. A large
  hand edit of the workspace can break a test that names an issue by id; fix the test or the edit.
- **`window.__wf`** (`mockControls`): `{ conflictNextWrite(), playNextEvent(), setArchifyAvailable(b), setConnection("live"|"reconnecting"|"offline"), reset(), loadSample(), holdSample(), setCodexPhaseMs(ms) }`.
  Latency 80–160 ms. Playwright smoke tests start from `reset()` (the empty board) or `loadSample()` (26 issues).

### shell builder: `src/main.tsx`, `src/app/**`

- `main.tsx` imports `@fontsource-variable/inter` and `./styles/base.css`, renders `<App/>`.
- `app/App.tsx` — QueryClientProvider, TooltipProvider, RouterProvider, `<Toaster/>`, `<MoveGateDialog/>`,
  theme + density sync (`usePrefs` → `document.documentElement.dataset`), `startLive` once, tab title
  `"(3) Workflow · wf"` (see Naming) where 3 = my open needs-you requests; `tabTitle(path, workspace, count)` lives in `app/tab-title.ts`.
- `app/router.tsx` — TanStack Router, code-based route tree per the table above; `validateSearch` for each route;
  `createHashHistory()` when `VITE_HASH_ROUTER === "1"`; register the router type. `/inbox` is a route whose `beforeLoad` redirects to
  `/w?needs=me`. The issue drawer, the issue page and `/skills` render lazy components inside a `Suspense` (`app/lazy-views.tsx`).
- `app/lazy-views.tsx` — `IssueDrawer`, `IssuePage`, `AddWorkDialog`, `SkillsView` and `SettingsView({ page })` as `React.lazy`; `preloadViews()` fetches their chunks;
  `whenIdle(fn)` runs a callback when the browser is idle. This keeps the main chunk under the 500 kB warning (the build must stay free of it).
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
  icon) with its one sub-item Board (`g w`), **Library** (BookOpen icon; `g l`) with Personal (`g p`, its page count), Team libraries (`g t`: the workspace library first, then
  each library added, then **+ Add team library**), Files (`g f`) and Skills (`g s`), each with a faint count; then the **Groups** tree (it filters the Workflow
  board); then Kit (`g k`, prototype tools) beside the Prototype pill; footer with theme (system/light/dark), density, notifications
  toggle, **a gear that opens Settings** (a link to `/settings/flow`, tooltip "Settings ⌘,", `aria-current` while under `/settings`; row 1 after the notifications button, before `?` on the collapsed rail, in row 1 of the phone sheet), ⌘K hint, `?` hint. **There is no Inbox item and no inbox count**: what needs you is the board's Needs you filter. Icon rail:
  one icon per view, tooltips list the sub-views. The phone sheet mirrors the expanded rail. Active states follow the route
  (`useActiveSubView`). `NotifyBanner` (the opt-in for browser notifications of blocking requests) sits in the nav.
- `app/GroupTree.tsx` — `role="tree"`; nested groups from `useGroupTree()`; each node: color dot (group hue), title,
  roll-up count, 32 px mini progress bar (status-colored segments), needs-you dot; selecting sets board `group`.
  Implicit groups show in italic. Collapsible nodes, keyboard arrows.
- `app/CommandPalette.tsx` — ⌘K. Result groups in order: Issues ("Recent issues" while the field is empty), Groups, Library, Glossary
  (a term opens `/glossary?q=<term>`), Skills (a skill opens `/skills?skill=<ref>`, and its hint is its source), Files (opens the file), Actions; the section that holds the best match
  goes first, so Enter runs what you typed. Actions: **Add work…** (`n`, group path) and **Add one issue…** (issue path); with an issue open:
  **Open <id> in Codex** (copies the command), **Do the next step of <id>** (a background run), move it to…, open it as a
  full page, "Edit goal.md of <id>", **Hand over <id>: copy its context** (`copyContextWithToast(id)` from `@/features/issue/handoff`: copies the bundle markdown, one toast "Copied context for wf-… (~1.9k tokens)" with **View**,
  which opens the bundle in the issue view's dialog) and **View the context of <id>**; while a run goes on the issue the "Do the next step" row is **Cancel Codex's run on <id>**; **Ask the library about <id>** (`openAskPanel({ issue })`; with no issue open the row is **Ask the library…**, and the panel offers recent issues to pick), then "Workflow · Board", "Workflow · Needs you" (the board filter; also found by typing "inbox"), **"Open settings"** and **"Skills flow"** (always listed) and one **"Change the <step> skill"** per step of the flow (listed only once you type, so the empty palette does not grow by seven rows; each opens `/settings/flow?step=<id>`),
  "Library", **"Open personal library"**, "Library · Team libraries", **"Add team library…"**, **"Search the library"** (goes to `/lib` and focuses the search box; `/`), "Library · Glossary" (the Glossary page), "Library · Files", "Library · Skills", "Kit (prototype tools)", theme, density, sidebar, shortcuts, simulate a conflict,
  play the next live event. **The Codex actions use the same code as the buttons**: `copyCodexCommand(issue)` and `useNextStep(issue)` (`{ busy, start, cancel }`) from
  `@/features/codex`, so a run started from the palette, the issue header or the card menu gives exactly one toast (when it ends) and the copy
  has one wording. While a run goes the palette's action says "Codex is working on it" and is disabled.
- `app/ShortcutsDialog.tsx` — `?`. Lists every shortcut from `SHORTCUTS` in `app/shortcuts.tsx` with `Kbd`; sections General, Go to,
  Workflow · Board, Issue, Library · Files. Go to rows: "Workflow · Board" `g w`, "Library"
  `g l` or `g d`, "Library · Personal" `g p`, "Library · Team libraries" `g t`, "Library · Glossary" `g g`, "Library · Files" `g f`, "Library · Skills" `g s`, "Kit" `g k`. A "Library · Pages" section lists `[`, `]` and `/`. General has `n` = Add work.
  Issue: keys 1 to 8 switch the tab (Now, Goal, Criteria, Plan, Log, Git, CI, Files). No inbox shortcut exists.
- **The legacy New issue and New group dialogs are gone** (`app/NewIssueDialog.tsx`, `NewGroupDialog.tsx`, `dialog-parts.tsx`, their Kit
  entries and `newIssueOpen`, `newGroupOpen`, `openNewIssue`, `openNewGroup` in the shell store). Add work (`features/add-work`) replaces both;
  `n` opens it. The "Context from the library" picker of the old dialog lives on in the Add work flow's context step (a chip per match) and in the
  New file dialog (`ContextPicker`); the Goal tab's "Add context" still adds context later.
- `app/RouteStates.tsx` — `RouteError`: "This view failed to load", the message, **Try again** (`router.invalidate()` then the
  boundary's `reset()`; it does not reload the page, so the mock's in-memory edits survive), Copy details, Go to Workflow.
  `RouteNotFound`.
- `app/DevPanel.tsx` — a small "Prototype" pill bottom-left (expanded nav; an icon in the icon rail and the phone bar); opens controls:
  play next live event, connection state, simulate conflict on next write, **archify available** (off by default; the unavailable
  diagram card's "Prototype" button turns it on and the switch follows), **Reset data** (back to the shipped files: groups,
  library, no issues), **Load sample data** (the 26 sample issues in one commit; toast "Loaded 26 sample issues"), open
  Library · Files, jump to Kit. "Play next event" says "No live events apply here. Load sample data to play them." when
  no scripted event fits the workspace. Toggled by the `.` key too.
- `app/shortcuts.tsx` — global hotkeys: ⌘K, ⌘B, `[`, `g w` Workflow (Board), `g d` and `g l` Library, `g p` Personal, `g t` Team libraries, `g g` the Glossary page,
  `g f` Files, `g s` Skills, `g k` Kit, `n` Add work, `?`, `.`, **`mod+,` Settings** (also in inputs). `g i` (inbox) no longer exists.

### board builder: `src/features/board/**`

`index.ts` exports `BoardPage`. Files: `BoardPage.tsx`, `BoardToolbar.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`,
`Swimlane.tsx`, `IssueCard.tsx`, `dnd.ts`, `useBoardKeys.ts`, `filter.ts`.
- Toolbar (44 px, the Board's one top bar): `ViewTabs view="workflow"` first, then the group breadcrumb (from `group` search)
  and the count summary (container queries: the summary needs 1280 px of board width; the breadcrumb shows its whole
  chain from 1152 px and only the current scope below that, the full path in its tooltip). At the right, in this order: text filter
  (`/` focuses), **Needs you** (`NeedsYouToggle`: a toggle with the count of the acting person's open requests across the workspace, accent
  above zero and when on; on, the board shows only the issues that have one: `?needs=me`; it also tells you when the group on show has none
  and the requests are elsewhere), author filter (AuthorStack + menu), swimlanes toggle (child groups | none), "Show cancelled", and the
  primary **+ Add work** button (`data-wf="AddWorkButton"`, shortcut `n`; it opens Add work on the group on show as the starting answer, and still asks where).
  The toolbar takes `needsYou={{ requests, issues }}` (the Kit passes it too). The old "New issue" button is gone.
- Empty states: an empty workspace says "No work yet" with **Add work** (primary) and **Add one issue**; an empty group says
  "No issues in <group> yet" with the same two buttons; the Needs you filter with nothing to show says "Nothing needs you" and, when
  requests wait elsewhere, "N issues outside <group> need you" with **Show all groups**.
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
  `useRecentlyChanged` → `wf-flash`. **While Codex works on the issue** `CodexRunMarker` (`features/codex`) takes the group path's place in the id
  row (the Codex tile, the task id, one word for the phase), so the card keeps its height.
  **Hover footer = an overlay.** `data-wf="IssueCardFooter"` is `absolute` on the card's bottom edge and grows from 0 with
  `grid-template-rows` (`0fr` to `1fr`), so the card never changes height and nothing below it moves while the pointer sweeps down a
  column. It shows "3/8 tasks · 2 ready", the last-activity author and time, and the "…" menu (Move to…, Open in new page, Copy link, Copy id, and the
  two Codex actions: **Open in Codex** (copies the command) and **Do next step**, disabled with "Codex is working on it" while a run goes).
  One card shows it at a time: the hovered one while the pointer was the last input, the focused one while the keyboard was; the board
  root carries `data-input="pointer|keyboard"` (set by `useBoardKeys`) for that. The footer covers the card's last row while open. Below
  768 px and on `(hover: none)` screens there is no hover, so the footer is a plain, always-open last row in the flow.
- Keyboard: `j/k` move card focus, `h/l` move column, Enter opens drawer, `o` full page, `s` opens the status menu
  of the focused card, `/` filter, `n` Add work (shell handles), Esc closes drawer.

### issue-frame builder: `src/features/issue/{index.ts, IssueDrawer.tsx, IssuePage.tsx, IssueView.tsx, IssueHeader.tsx, tabs/FilesTab.tsx, DocsList.tsx, DocView.tsx, LintPanel.tsx, HandoffPanel.tsx, handoff.ts, skill-hint.tsx, MetaLine.tsx, delivery-focus.ts}`

`index.ts` exports everything public of the issue feature: `IssueDrawer, IssuePage, IssueView, IssueHeader,
StateSnapshot, NeedsYouList, CriteriaChecklist, CoverageStrip, PlanLanes, PlanList, TaskPill, ChangesTimeline,
DecisionCards, LearningCards, DocsList, DocView, LintPanel, MetaLine, HandoffButton, HandoffPanel, HandoffViewHost, SkillHint, SkillLink` and the helpers `copyContext, copyContextWithToast,
showContext, handoffPrompt, tokenCount, tokenLabel, ASK, codexAsk, WF_SKILLS` (the Criteria, Git and CI tabs are in `tabs/`; see "issue-delivery" below).
The shell loads the feature lazily (`app/lazy-views.tsx`): nothing outside `features/issue` imports it statically. **The one exception is `features/issue/handoff.ts`** (no React, a few
hundred bytes): the palette imports `copyContextWithToast` from that file directly, never from the barrel, so the issue chunk stays lazy.
- `IssueDrawer({ id })` — `docked` (≥1600): a right panel inside BoardLayout's flex row, width `usePrefs().drawerWidth`,
  draggable left edge (440–760). `overlay` (768–1599): a sheet over the board with `shadow-pop`, click-outside closes.
  Esc closes (`useCloseIssue`). Contains `IssueView variant="drawer"`.
- `IssuePage({ id })` — full page: top bar with breadcrumb + back to board; `IssueView variant="page"`.
- `IssueView({ id, variant })` — loads `useIssue(id)`; skeleton while loading; "Issue <id> not found" (with "Back to board") when
  the read is a 404, also when the issue was open and then vanished (Reset data, leaving the Kit, a deleted folder): a failed
  background refetch keeps the cached copy on screen, except a `NotFoundError`; header; then:
  - **drawer and narrow page (under 768 px): eight tabs**, `Now · Goal · Criteria · Plan · Log · Git · CI · Files` (`ISSUE_TABS`,
    `useIssueTab`), each tab panel scrolling independently. Keys **1 to 8** switch them in that order. Eight labels do not always fit a 440 px drawer
    or a phone, so the strip scrolls sideways there, with a fade on the side that has more, and keeps the active tab in view. Counts: needs-you
    on Now (accent), criteria verified/total on Criteria, tasks done/total on Plan, entries on Log, commits on Git, the latest CI run's state (a dot)
    on CI, files + lint on Files. Goal has no count: its criteria moved to their own tab.
  - **page, by the width of the page region** (the nav rail counts as page; `useElementWidth` on the root): from 1080 px, **three independently
    scrolling columns**: `[Now + Goal] | [Plan + Criteria] | [Log · Git · CI]`, the Plan column at least 480 px wide, the third column a row of
    view titles (`ViewColumn`) that follows `?tab=` when it names one of its views and draws the active one with the **same 2 px bar as the drawer's tab strip** (and `hover:bg-muted`), so
    the control looks alike at every width; from 768 to 1079 px **two columns**,
    `[Now + Goal] | [Plan · Criteria · Log · Git · CI]` (the same view row); under 768 px the tab layout above. **Keys 1 to 8 work in every layout** (`PageFrame` registers them from
    768 px; the phone layout's `IssueTabs` registers them below): a section of a column (`Now`, `Goal`, and on the wide page `Plan` and `Criteria`) scrolls into view and takes focus
    (`focusSection`; each `ColumnSection` is a `<section>` with `tabIndex={-1}`), a view of the log column switches (`?tab=`), `8` opens the Files sheet. Files and lint
    are reachable from the header (a "Files" button opening a Sheet with `FilesTab`; a tab on the phone). A link to a task (`T-n` pill) asks for
    the Plan tab: on the wide page the plan is already in its own column, so the view of the third column stays where it is.
- `IssueHeader({ detail, variant })` — id (mono, copyable), title (16 px semibold), `StatusSelect`, priority, size,
  owner, coordinator lease (AuthorChip + "lease 34m left" or amber "lease expired"), labels, due, `LintBadge`,
  buttons: Open in new page ↗ (`o`), Copy link, **Copy context** (`HandoffButton`, below), Close (drawer only). Under the property row sits
  **`CodexActions`** (`features/codex`): **Open in Codex** and **Do next step** side by side (see "features/codex"), above the derived signals so the
  run's strip stays put when a signal appears. **While a run goes, the Q005 signal ("current_state is behind") is held back** (`useRunActive`, here
  and in the Now tab's meta line): Codex writes `current_state.md` last, so the log is ahead of it by design, and a row that came and went
  mid-run pushed the tabs down about 40 px. The signal returns, if still true, 1.5 s after the run ends.
- **Hand off: `HandoffButton({ issueId, compact? })`, `HandoffPanel({ issueId, copied? })`, `HandoffViewHost({ issueId })` (`HandoffPanel.tsx`) and `handoff.ts`.** Goal 2 of the user: handing an
  issue to someone hands over **the content, not a command**. "Copy context" reads the bundle (`api.context`, the markdown the `handing-off` skill prints: header, goal, success criteria, current
  state, linked context, ready tasks, tasks in progress, last changes, accepted decisions, learnings, git, PRs and CI, plan approach, library, then the footer and the resume line, within
  `[context] budget_tokens`) and puts it on the clipboard (`copyContext(id)`), then opens a popover built like Open in Codex's: its status line says "Context copied (~1.9k tokens)", the
  bundle itself is shown as written (what you see is what you copied), **Copy context**, **Copy prompt** (`Hand wf-… over: use the handing-off skill.`, for Codex or Claude), **View all**
  (a dialog with the whole text, mounted by the issue view as `HandoffViewHost`; `showContext(id)` opens it from anywhere, and only one host draws it), the sections the budget cut, and one faint line "With the wf CLI later: `wf context <id>`".
  **One confirmation per event:** the popover's line is the confirmation for the header, so it has no toast; the palette has no popover, so `copyContextWithToast(id)` gives one toast with **View**.
  **Open in Codex** stays the way to start Codex; the two sit side by side.
- `tabs/FilesTab.tsx` `FilesTab({ detail })` — `DocsList` + `LintPanel`. `DocsList` rows are a grid: name, description, lint, meta on one line from 480 px of row width; under it the description moves to a
  second line under the name (it used to be cut to two letters) and the meta keeps one right-aligned column. A missing issue file names the skill that writes it as a link
  (`goal.md` → `adding-work`, `plan.md` → `planning-issues`, `current_state.md` → `handing-off`, the three logs → `logging-work`).
- `DocsList({ docs, onOpen })`, `DocView({ doc })` (markdown via MarkdownProse; images inline; other files: size + open raw).
- `LintPanel({ diagnostics })` — grouped by file, severity icon, rule id (mono), message, "line 12" jump link
  (copies `path:line`), fix hint, and "Edit at this line": `useEditAtLine()` calls `useFilesNav().edit(path, { line })`, so the editor opens with
  the caret and the scroll on that line (`EditIntent.line`). The Goal tab's F001 banner "Fix in editor" does the same.
- Tab components from other builders, all with props `({ detail: IssueDetail, variant: "drawer" | "page" })`:
  `tabs/NowTab.tsx → NowTab`, `tabs/GoalTab.tsx → GoalTab`, `tabs/CriteriaTab.tsx → CriteriaTab`, `tabs/PlanTab.tsx → PlanTab`,
  `tabs/LogTab.tsx → LogTab`, `tabs/GitTab.tsx → GitTab`, `tabs/CiTab.tsx → CiTab`, `tabs/FilesTab.tsx → FilesTab`.
- `[[#SC-n]]` links (`RefLink`) go to the **Criteria** tab; `[[#T-n]]` to Plan, `[[#Q-…]]` to Now, `C-`/`D-`/`L-` to the matching Log view.

### issue-now-goal builder: `src/features/issue/{tabs/NowTab.tsx, tabs/GoalTab.tsx, StateSnapshot.tsx, NeedsYouList.tsx, CriteriaChecklist.tsx, CoverageStrip.tsx}`

(The criteria and their coverage moved out of the Goal tab into the Criteria tab, plan D1; the components below are unchanged and now live there.)

- `NowTab({ detail, variant })` — `StateSnapshot`; empty state when `state` is null (a `SkillHint` for `handing-off`: "Write current_state.md for wf-… with the handing-off skill.").
- `StateSnapshot({ state: CurrentState, detail: IssueDetail })` — summary line (14 px, the hero); "updated 12m ago by
  @claude-opus" with staleness tint (amber when older than `issue_hours` or `summary.signals.state_behind_changes`
  → "behind 3 changes", held back while a Codex run goes on the issue: `useRunActive`; the meta line is a `MetaLine`, so a wrap never leaves a dot at a line edge); `NeedsYouList` with inline answer box; In flight with `TaskPill`s; Blocked (danger left
  hairline); Next steps numbered, item 1 emphasized as "Next"; Done, Handoff notes, Failed attempts collapsed
  (Collapsible, with counts). Word count warning when >400 (Q008).
- `NeedsYouList({ items: NeedsYouItem[], issueId })` — each: kind icon, question, from → to, urgency chip
  (blocking = accent), asked time, ref link, options as buttons (approve/reject) or a textarea for question/input;
  submit → `useAnswerRequest()`; answered items show "Answered by @shruti" and "Waiting for the agent to pick the answer up. `doing-next-step` resolves it first." **Focus
  follows the answer:** the Approve or Reject button is gone once the request is answered, so focus moves to the next open request's main button (or its text box), and when that was the last
  request to the Now panel (`moveFocusOn`), instead of falling to the page. The answered block is a `role="status"` region; there is no toast (the row says it).
- `GoalTab({ detail, variant })` — Context (MarkdownProse with diagrams), Out of scope, Linked context (the `## Links` bullets, with "Add context"),
  unknown frontmatter keys (F006) as faint key/value rows. **No success criteria here**: they are the Criteria tab. When
  `goal.frontmatter_ok` is false: show the F001 finding banner and the raw file in a mono block with the error line
  highlighted (this is SC-2 in the dogfood issue). A goal with criteria but no context says "No context yet … The success criteria are in the Criteria tab." Its empty state is a
  **Write the context** button (opens `goal.md` in the editor, `useEditAtLine`) and a `SkillHint` for `using-wf` (the formats): `adding-work` is for new issues, not for editing one.
- `CriteriaChecklist({ criteria, issueId })` — header with `ProgressRing` (size 28, label) and "2 verified · 1 claimed
  · 5"; each row: criterion checkbox (open/claimed hatched/verified solid), `SC-n` mono, the EARS sentence with
  keywords in faint small caps (`ears.keywords` spans), chips: `verify` (mono command or "manual"), `evidence` (link),
  freeform/not measurable warnings (S07/S08) as faint chips; toggling → `useToggleCriterion`; expanding a row
  shows scenario and verified_by. A tick from the board is a claim; the "Claimed, not verified yet" popover says a criterion is verified when its verify command passes and the evidence is written
  beside it, which `doing-next-step` does (with a `SkillHint` whose prompt names the criterion). The **evidence chip** keeps its code at 11 px (`--wf-code-size`) and draws it without a chip of its own;
  `InlineText` code is `code-inline` (12 px, or `--wf-code-size`), never `0.9em`, so no code is smaller than 11 px. No criteria: a **Write a criterion** button (editor) and a `SkillHint`.
- `CoverageStrip({ criteria, tasks })` — one compact row per SC: which tasks satisfy it (TaskPills); uncovered
  criteria flagged (Q006 info).

### issue-delivery builder: `src/features/issue/{tabs/CriteriaTab.tsx, tabs/GitTab.tsx, tabs/CiTab.tsx, delivery-ui.tsx}` (plan D1, D2)

- `CriteriaTab({ detail, variant })` — how we know the issue is done: `CriteriaChecklist` (tick, claimed, verified, evidence) and below it
  `CoverageStrip` (which tasks satisfy each criterion). With no `plan.md` it says so ("Small issues may skip the plan, so task coverage is not
  tracked" for xs and s). When `goal.md` does not parse, it points at the Goal tab, which shows the finding. Key `3`.
- `GitTab({ detail, variant })` — **Pull requests** and **Commits** of the issue from `useDelivery(id)`, newest first. `PullRequestRow`: state
  (draft, open, merged, closed), title, number, branch, review state (pending, approved, changes requested) and checks (passed, failed, pending) in a fixed order.
  `CommitRow`: short sha (copy), subject, author, time, branch, pull request, and a `T-n` pill that selects the task in Plan. **The reverse link works too** (`delivery-focus.ts`): a Log entry's
  commit chip and a task's "Commits" row switch to the Git tab and mark that commit's row (`data-focused`, 1.8 s, scrolled into view); a commit the Git tab does not list still copies its sha.
  A commit that Codex just made is highlighted once (`useFreshKeys`). Empty state: "No commits mention wf-xxxxx yet", with the trailer
  `Issue: wf-xxxxx` to copy (`TrailerCopy`) and the branch name `wf-xxxxx/…` that also finds the issue. The prototype has no links out (`url` is null). Key `6`.
- `CiTab({ detail, variant })` — **pipeline runs** (`PipelineRow`), newest first, each a collapsible with its jobs: workflow, result
  (`RunStateIcon`: green check, red cross, a turning arc while it runs, a dashed ring while it waits), duration, trigger, branch and sha; a failed run names
  the failed job before it is opened. Empty state: "No CI runs for wf-xxxxx yet". A run that Codex starts appears without a reload. Key `7`. The run's id leads a row of the workflow `CI` (the word
  "CI" in the CI tab says nothing); a failed run says "test failed 1m 37s" once, in the first line; the second line is a `MetaLine` (trigger, branch, sha, time) that wraps rather than cutting the branch.
  A task's "CI" row opens the tab on that run (it opens it and marks it).
- `delivery-ui.tsx` — the shared bits: `RunStateIcon`, `CiDot` (the CI tab's count), `TrailerCopy`, `gitTitle`/`ciTitle` (tab tooltips),
  `deliveryCounts`, `shortBranch`, `useFreshKeys`.

### issue-plan builder: `src/features/issue/{tabs/PlanTab.tsx, PlanLanes.tsx, PlanList.tsx, TaskPill.tsx, TaskDetail.tsx}`

- `PlanTab({ detail, variant })` — Approach (MarkdownProse with diagrams), Assumptions (A-n with open/confirmed),
  Prior art (RefLinks), then the plan view with a `Segmented` toggle Lanes | List (`usePrefs().planView`) and a
  "Ready: 2" highlight toggle. Plan header: revision, updated by/at. Empty state when `plan` is null: **a button, "Do next step"** (the same label at every size: the run writes the plan first, then claims T-1), which
  starts a run (`useNextStep`; **an issue without a plan has the planning as its first step**, as in the `doing-next-step` skill), and a `SkillHint` for `planning-issues`.
- `PlanLanes({ plan, criteria })` — rows = lanes, columns = dependency levels (`task.level`); `TaskPill`s placed in
  cells; dependency edges drawn as SVG curves **only** for the hovered/selected task (its deps and dependents);
  ready tasks get an accent ring when the Ready highlight is on; lane labels at left (sticky). Horizontal scroll inside. **Responsive by the width of its own box:** a level column is
  `minmax(168px, 240px)` (two fit a 440 px column), the gap is 12 px, and the grid is `width: 100%` but never narrower than every level at its minimum, so a third level scrolls instead of squeezing
  (the right-edge fade says so). **Under 520 px the lane name moves above its tasks** (two rows per lane, name sticky at the left) so two levels fit a 360 px phone column. The task in progress
  (else in review) is scrolled into view once when the lanes open, so the task the issue is about is never the one behind the edge.
- `PlanList({ plan })` — phase stepper: each phase a row with progress; finished phases collapsed; tasks as rows with
  status glyph, id, title, claimant, steps x/y, lane chip.
- `TaskPill({ task: Task, size?: "sm"|"md", onClick?, selected? })` — `StatusIcon` + `T-3` mono + title (truncate) +
  claimant avatar; lease expired → amber dot; stale → amber; ready → accent dot. Used by Now and Goal too.
- `TaskDetail({ task, issueId })` — Popover (lanes) or inline (list): brief, steps checkboxes (`useToggleStep`),
  depends_on, owns (mono), satisfies, verify, lease, status menu (`useSetTaskStatus`). **Commits and CI** (`DeliveryRows`): the commits whose change entry names the task and the CI runs of those commits
  (`useDelivery`), each a button that opens its row in the Git or CI tab (`focusCommit`, `focusRun`); the popover closes when it navigates (`onNavigate`).

### issue-log builder: `src/features/issue/{tabs/LogTab.tsx, ChangesTimeline.tsx, DecisionCards.tsx, LearningCards.tsx}`

- `LogTab({ detail, variant })` — `Segmented` Changes | Decisions | Learnings with counts (`useIssueTab().log`).
- `ChangesTimeline({ changes, issueId })` — sorted by ts desc; grouped by day with sticky day headers; a vertical
  rail with author-hue dots (agent = rounded square, human = circle); per entry: kind glyph, title (13 px medium),
  author, relative time, task/criteria chips, result pass/fail chip, commit/pr/files chips (mono), body
  (MarkdownProse compact, collapsed beyond 3 lines). `failure` entries and `result: fail` in danger tone;
  `answer` entries show Q and A. Filter chips by author and kind at top (the bar shows only when it has a filter to offer, and the count only while a filter is on: "3 of 12"; the total is already
  in the tab and the segmented control). The **commit chip opens the Git tab on that commit** when the tab lists it. Empty states: a `SkillHint` for `logging-work` (change, decision, learning).
- `DecisionCards({ decisions, issueId })` — ADR cards: status chip (proposed/accepted/rejected/superseded), title,
  **Decision** first and prominent, Because, Consequences, Revisit when; Rejected collapsed; superseded decisions fold
  under their successor ("supersedes D-…" chain, expandable); topic chip; affects SC chips; decided_by authors;
  Promote button (opens `PromoteDialog` from `@/features/library`). A **proposed** decision says its status line is the only thing accepting or rejecting changes, with a `SkillHint` for `logging-work`
  (`ASK.decide`); real Accept and Reject buttons need an op in the data layer (see HANDOFF).
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

### library builder: `src/features/library/**` (spec: `docs/plan/proposals/libraries-spec.md`)

The Library is a set of **libraries**: folders of markdown and media in a git repo, read as a document wiki. There are three origins
(`LibraryOrigin`): the **workspace library** (decision L4: `library/` plus `glossary.md` as the page "Glossary"; alias = the workspace name, `wf`;
listed first), the **personal library** (alias `me`; the files under `mock/personal/`, editable) and **team libraries** (added by a GitHub link;
`registerLibrary`). The model is `mock/libraries/` (pure; the registry `createLibraries(store)` is stateful), the API `src/lib/api/library.ts`, the
viewer `src/features/library/`.

- **Model (`mock/libraries/`).** A `LibrarySource` (`@/lib/api/types`: `alias, kind, name, description?, url?, ref?, commit?, root?, access?, files, media`,
  plus `others?`, `origin?`, `meta?`) becomes a `Layout` (`tree.ts`: pages, media and other files under the root; `findLibraryRoot` of spec 4.2 in
  `manifest.ts`), a `LibraryTree` and `LibraryPage`s (`corpus.ts`, `buildCorpus(sources, workspaceFacts)`): folders are sections; `index.md`,
  `README.md` or `_group.md` is a section's own page; a title is the frontmatter `title`, else the first `#` heading, else the file name read as words;
  order is `wf-library.toml`'s `nav.order` (or the personal `library.toml`'s), then `order:`, then alphabetical by title. Links of every form (`links.ts`:
  relative, `[[path]]`, `[[alias:path]]`, `[[wf-xxxxx]]`, `[[lib-xxxxx]]`, `[[#heading]]`, external) are resolved per page; a page lists its **backlinks**
  across libraries and the **issues** whose `goal.md` `## Links` (or any file that cites a workspace item) name it. `search.ts` is a BM25 index over
  title, headings and text, **per section** (a heading of level 1 to 3 starts one); `searchSections(index, query, { aliases?, pages?, k? })` returns
  passages with a snippet and `marks`. Team libraries are listed in the personal `libraries.toml` (`[[team]]` blocks); `registerLibrary(source)` and
  `unregisterLibrary(alias)` keep that text.
- **API (`@/lib/api`).** `useLibraries()`, `useLibrary(alias)`, `useLibraryTree(alias)`, `useLibraryPage(alias, path)`, `useBacklinks(address)`,
  `useLibrarySearch(query, scope?, k?)`, `resolveAddress(raw, from?)`, and the writes `savePage`, `deletePage`, `saveMedia`, `addLibrary(source)`,
  `removeLibrary(alias)` (and `useSavePage`, `useAddLibrary`, `useRemoveLibrary`). Reads follow the libraries live while mounted (`useLibraryLive`).
- **The viewer.** `WikiView({ alias, path })` is the page of `/lib/me*` and `/lib/t/*`: the 44 px top bar (`LibraryTopBar`: the Library tabs and the search with its
  scope, `LibrarySearchBox`), then page tree (240 px, `PageTree`) · document · right rail (`RightRail`: On this page, Linked from, Used in issues, Page facts)
  at **1280 px and up**; at **1024 to 1279 px** On this page is a popover in the header (`OutlinePopover`); under **1024 px** the tree is a left `Sheet`
  (a Pages button; on a phone it sits in the search row). `PageHeader` holds the breadcrumbs (Library / library / sections), the title, a `MetaLine` (kind,
  updated and by whom, minutes to read), the **Rendered | Source** switch, and the actions **Ask about this page** (`openAsk(address)` from `ask-hook.ts`),
  **Link to an issue…** (`LinkToIssue`: pick an issue, a `- [[address]] title` bullet goes under its `## Links`; a workspace item keeps its `lib-` id),
  **Copy link**, **Open on GitHub** (team pages) or **Open in Files** (the workspace library), and **Edit** (personal library: `PageEditor`, the Files
  `SourceEditor` with a `save` of its own; the header then says "Saved · pushed a1b2c3d"). The keys: `[` and `]` go to the previous and next page in
  reading order (they override the sidebar's `[` while a page is open), `/` focuses the search. A search (`?q=`) replaces the page with
  `SearchResults`, grouped by library, each passage under its heading with the words marked. A library without a home page, or a folder without a
  page, shows `LibraryOverview` (drawn from the tree). `LibraryHome` (`/lib`): a card per library, the add card, the pages opened last (`recent.ts`,
  kept in this browser only).
- **The workspace library's own features stay.** A page that is a library item shows its banners (Draft: **Approve** via `useApproveLibrary`, Retired,
  review overdue; `ItemBanners`) and its facts (kind, status, authors, reviewed by, created, last reviewed, review after, tags, applies to, promoted from,
  id; `ItemFacts`); the Glossary page renders `GlossaryView embedded` (terms, the words to avoid, See links, the line in glossary.md). `PromoteDialog({ open,
  onOpenChange, issueId, entry })` is unchanged: kind (prefilled from the entry), slug (auto), preview, dedupe suggestion, Create draft → `usePromote()`.
  `[[lib-xxxxx]]` links from issues (`RefLink`) go to `/lib/lib-xxxxx`, which redirects to the item's page.
- **Where the rest lives.** The personal home and summaries are `features/library/personal/` (below), the Add team library flow is `features/library/team/`
  (below), Ask library is `features/ask/` (below). `ask-hook.ts` is the seam between the page header and the Ask panel (`openAsk(address)` opens the
  panel on that page; `AskHost` registers it with `setAskHandler`). `openAddLibrary()` (`app/shell-store.ts`) opens the Add team library dialog.
- **Media rules (spec L7).** A page names media relative to itself: `![Caption](media/flow.gif)`. `MarkdownProse` (`document="wiki"`, `wiki={{ alias, path,
  links, media }}` from a `LibraryPage`) renders it through `MarkdownMedia.tsx`: a picture is a `MediaFigure` (the alt text is the caption; a click opens it
  full size); a **GIF** plays unless the reader prefers reduced motion, then it shows its first frame under a Play button (`GifPlayer`); a **video file**
  (`.mp4`, `.webm`) is a `VideoPlayer` with controls, `preload="metadata"`, never autoplay; a line holding **only** a YouTube, Vimeo or Loom link is an
  `EmbedCard` (no request to the provider until the card is clicked; a `[![Title](media/poster.png)](url)` uses the picture as its poster); a file over
  25 MB (`LARGE_MEDIA_BYTES`) is linked, not loaded; a file the library lacks says so, quietly. Callouts are GitHub's `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
  `[!WARNING]`, `[!CAUTION]`. Headings carry GitHub anchors; a broken `[[link]]` is dashed and listed in the page facts. A wiki table is 14 px so its code stays
  at 12 px. Where the files live: personal `mock/personal/**` (and `mock/personal-sample/**` while the sample is loaded), the workspace library
  `mock/workspace/library/**`, the example team library `mock/teams/acme-platform-handbook/**`. The `?wf-asset` import gives `{ url, bytes }`.
- **Document typography.** UI text is 13 px; a wiki page body is 15 px (16 px from 1280 px) at line height 1.65, in a column of about 72ch; h1 28, h2 22, h3 18
  (see `MarkdownProse`). Color only for status, author or group; one indigo accent.

### personal library builder: `src/features/library/personal/**` (spec section 3)

`/lib/me` is `PersonalHome`: a header (Private, the repo, the page count), then three sections, each a part of the markdown tree of the personal repo.
**Research topics** (`TopicsSection`: `topics/<slug>/index.md`, a card per topic with its status, question, updated and note count, ordered active, paused, done;
**New topic** writes a page from a template with `savePage`), **Codebases** (`CodebasesSection`, `CodebaseCardView`: `codebases/<owner>-<repo>.md`, the repo, the
commit, "N commits behind main" from `codebase.ts`, Refresh) and **Work** (`WorkSection`, `WorkSectionView`: the group tree of the workspace with each group's
issues under their status; a **Stale** mark when the issue or a group above changed after the summary; **Summarize this group**). A summary page shows
`SummaryBanner` under its title. Before the first visit, `PersonalSetup` offers **Create github.com/<you>/wf-library (private)** or **Use a repo I already
have** (the link field appears only after the second); `window.__wf.resetPersonal()` and `setUpPersonal()` flip it.

- **Work summaries are generated, deterministically.** `mock/libraries/work-summaries.ts` writes `work/<workspace>/<group path>/_group.md` and `<issue-id>.md`
  from the parsed workspace (formats of `plugins/workflow/skills/summarizing-work`). The rev of a page is the first 7 hex characters of the SHA-256 of the wf
  files of its folder with times made neutral, so a lease renewal does not make a summary stale; `personal/work.ts` (`summaryState`, `workTree`) is the pure part.
  The pages of the sample live in `mock/personal-sample/work/` and show only while the sample is loaded; four of them are kept by hand as an older state so the
  demo shows Stale. A test pins the other 29 to the generator.
- **Agent hook.** `setPersonalAgent({ summarize(request) })` (`personal/summarize.ts`): the agent connection registers it. Without one the prototype rewrites the page itself
  after a short "Summarizing…" and says "Prototype".
- **Fixture content.** Two research topics with a GIF, a video file and a YouTube card (`mock/personal/topics/`), a real summary of this repository
  (`mock/personal/codebases/`). The `biome.json` in `mock/personal*` keeps the formatter off the markdown.

### team libraries builder: `src/features/library/team/**`, `mock/libraries/github.ts`, `mock/teams/**` (spec section 4)

**Adding a library takes one paste.** `AddTeamLibraryDialog` (opened by `openAddLibrary()`: the nav's **+ Add team library**, the library home card, the palette) is Add
work's pattern: one screen at a time, Back and progress dots at the bottom. **1 Paste a GitHub link** (the one field; a pasted link goes on at once; the example
`acme/platform-handbook` and unread entries of `libraries.toml` are buttons), **2 Which folder** (only when several of `library/`, `docs/`, `wiki/`, `handbook/` hold
markdown; number keys), **3 Add this library?** (name, description, counts, public, the last commit, the alias with an Edit button, the first page small). **Add library**
reads every page (`readLibrary`), calls `addLibrary(source)` (the `[[team]]` block of `libraries.toml`) and opens the library. A failure is one plain sentence with a way
forward (`explain` in `flow.ts`): another host, a gist or raw link, private (**Connect an agent to read private repos**, the hook `setConnectAgentHandler`),
unreachable (**Try again**, **Use the example library**), rate-limited (when GitHub lets the page ask again).

- **Reader.** `mock/libraries/github.ts` (`parseGithubLink`, `findLibrary`, `previewLibrary`, `readLibrary`, `remoteHead`): the tree comes from one `git/trees?recursive=1` call
  (3 API calls a lookup, ETag cached), files from `raw.githubusercontent.com/<o>/<r>/<sha>/<path>` pinned to the commit. It lives in `mock/` for now and is its own chunk. The unauthenticated limit is
  60 calls an hour. A repo the prototype knows by name (`mock/teams/`, `FIXTURES`) is read offline in every link form; `window.__wf.teams.moveRemote()` plays a newer commit on it so
  the footer's **Update** shows, `resetRemote()` undoes it.
- **After adding.** A page footer says "a1b2c3d · 2 days ago" and, when the branch moved, "A newer version is on GitHub. **Update**" (`TeamCommit`, `useTeamUpdate`); the
  header has a **library menu** (`TeamLibraryMenu`: Open repository on GitHub, Update, Remove library… with a confirmation). A library added in a session is gone on reload
  (the registry holds it in memory; only a hand-written `libraries.toml` entry persists, and shows as "Not loaded" with a one-click read).

### ask library builder: `src/features/ask/**` (spec section 6, decision L3)

**Ask library** in the issue header (`AskLibraryButton`), **Ask about this page** in the library, and the palette open a side panel (`AskPanel` in `AskSheet`, 440 px, to the left of the issue
drawer when both fit; it never closes on a click outside; Esc closes only the panel; under 640 px it covers the width). `AskHost` is mounted by `AppShell`. Top to bottom:
**Where to look** (`ScopeChips`: buttons for Linked to this issue, My library, one per team library (the workspace's is "This workspace"), and **Pick pages…**, a tree of
checkboxes in `PagePicker`; a size line "2 pages · ~480 tokens"), **Question** (`QuestionBox`: three suggested questions from `questions.ts`: the open request, the next unverified
criterion, the goal; and a text box), then the result: reading, **the answer** (`AnswerView`: markdown with `[n]` citation chips and a Sources list, each opening the cited section in place;
**Link cited pages**, **Save to log**, **Copy**; each write is one line in the panel, not a toast, and its button is spent) or, with no answer, the five best passages (`PassageList`) and
**Connect an agent for an answer**.

- **Who answers.** A connected agent first (`setAskAgent({ handle, ask(request, signal, onText) })`; the request carries the `querying-library` prompt: `Pages:` lines and the question),
  else the prototype (`mock/libraries/ask.ts`, extractive and labelled "Prototype answer from N passages"; `window.__wf.setPrototypeAnswers(false)` turns it off), else nobody.
  `answer.ts` (`parseAnswer`) reads the skill's output: the answer above the last `## Sources`, `[n]` citations, `Not in these pages.`, `Could not read:`, `Note:`.
- **Writes.** `add_links` takes `kind: "page"` (`- [[alias:path]]: Cited for “<question>”.`; a workspace library item keeps its `lib-` id, a retired one is left out) and `add_learning`
  (`useAddLearning`: a learning titled by the question, its summary the rule, `Evidence: answered from the library, sources:` and one `[[alias:path#section]]` bullet per source). Linked
  team pages enter the context bundle as reference data pinned by commit (`platform:runbooks/x.md@a1b2c3d`), with a closing tag defused.
- **Kit.** `AskBody` and `AskResult` are exported so the Kit can draw the panel's states in a frame (`question` asks one question on mount).

### workspace-files builder: `src/features/files/**` (+ View source in `features/issue/{tabs/FilesTab,DocsList,DocView}.tsx`)

The prototype's way to see and change the markdown the board is built from. Route `/files?path=<workspace-relative path>[&line=n]`;
a Library sub-view: nav item "Files" (`g f`); palette "Library · Files" and "Edit goal.md of <open issue>"; a button in the DevPanel.
There is no "Prototype" chip on the page (the top bar's one-line explanation has a tooltip that says edits stay in the browser tab).
`index.ts` exports `WorkspaceView`, `WorkspaceTree`, `SourceView`, `SourceEditor`, `NewFileDialog`, `useFilesNav`, `FilesLink`, `filesHref`,
`requestFileEdit`, `ISSUE_FILE_NAMES`, `issueFileTemplate`, `templateForPath`, `type FilesSearch`; `@/app/search` has `validateFilesSearch`.
- `WorkspaceView({ path? })` — 44 px top bar (`ViewTabs` for the Library, a one-line explanation from 1360 px, "New file"), a 280 px tree at
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
  validated (workspace-relative, `.md` or `.toml`, no `..`, no ignored folders, no duplicates). It also takes context from the library.
- Issue Files tab — every issue file and doc row has "View source" (inline `SourceView`, with Edit and "Open in Files"); a missing issue file
  has "Create", which opens the editor with a starting text. `DocView` has "View source" too.
- Data: only `useWorkspaceFiles`, `useWorkspaceFile`, `useWriteWorkspaceFile`, `useDeleteWorkspaceFile` from `@/lib/api`.
  The editor never holds data of its own; what you save is read back through the same loader as a file saved on disk.

### features/add-work: `src/features/add-work/**` (plan D6, + Add work)

`index.ts` exports `AddWorkDialog`. The shell mounts it lazily and opens it through `openAddWork(start?)` (`@/app/shell-store`; `n`, the toolbar's **+ Add work**, the
empty board's buttons and the palette). It replaces the New issue and New group dialogs. **One question per screen; buttons first, then
multiple choice, then a dropdown; a field only for the one thing nothing else can capture.** Number keys pick an answer, Enter goes on, Backspace or ← and the dots go back, Esc asks to discard once
something is typed or proposed (`isDirty`). Files: `flow.ts` (the flow as plain data: the steps of each path, what a screen needs, the names, the
arguments of `useCreateWork`; no React), `useAddWorkFlow.ts` (the state and the keys), `AddWorkDialog.tsx` (the dialog, `DiscardDialog`), `AddWorkPanel.tsx` (the inside, shared with the Kit), `parts.tsx`
(`ChoiceList`, `ChoiceButton`, `ToggleChip`, `ProgressDots`, `KeyCap`, `KeyHint`), `steps/*`.
- **Group path** (`GROUP_STEPS`): What → Where → Outcome (the one typed line) → Name (three suggestions made from the outcome, or "Write my own") →
  Size → Priority → Context → **Codex splits** (the last screen). **At most 8 clicks, the click that opens the dialog included, and one typed
  line**: open (1), What (2), Where (3), type the outcome and press Enter (no click), Name (4), Size (5), Priority (6), Context "Skip" (7), then the button of the
  split screen that adds the issues (8). `clicksToAdd` and `GROUP_CLICK_BUDGET` pin it in the tests. Choosing Planned instead of Backlog is one more click (or key `2`).
- **The split screen is also the review.** While Codex splits (three visible steps, about 2 s, `SplitProgress`) it shows progress; then one `SplitCard` per
  proposal (keep or drop, size, priority, the title editable on demand), **Start in: Backlog | Planned** (`StartIn`; keys `1` and `2`; Backlog until changed), and the primary button
  **"Add N issues to <group>"** (Enter). There is no separate Review screen on the group path. A split that fails says so with "Try again"; "Split again" starts over.
  The proposals stay while the outcome, name, size and context stay the same (`splitSignature`).
- **Issue path** (`ISSUE_STEPS`, from "Add one issue…" or after picking "One issue"): What → Where → Title (typed) → Priority → Size → Status (Backlog or Planned) → Context → a short
  Review ("Add issue to <group>"), the one place a lone issue is checked before it is written. **Codex drafts the criterion and the reason** there (about 2 s, through the split API: the proposal
  whose title opens with the same verb as the person's title, else the second one), shows the criterion with an **Edit** button, and writes a real EARS criterion and a real `## Context` into goal.md ("<why> It belongs to wf / web."): never a placeholder.
  7 clicks, the opener included ("Add one issue…" skips the first question).
- **Where** is buttons (the top level and every group, "Inside wf / web") up to 12 places (`MAX_WHERE_BUTTONS`; the list scrolls inside the screen and the number keys reach the first nine), a searchable list beyond. The place starts at the group the caller named,
  then the group the board shows.
- **Context** shows the library items and glossary terms that match what was typed as toggle chips (the most used ones when nothing matches); picks are linked under `## Links` of every created issue.
- **Names** come from `suggestGroupNames(outcome, taken)` (`src/lib/api/names.ts`, shared with the split titles): always three noun phrases ("Board speed", "Handoff bundle", "Single sign-on"), never a fragment of the sentence.
  The outcome is written as the group's `goal:` line in `_group.md` (adding-work step 5); each issue's context is its own reason, not a copy of the outcome.
- **Stale proposals are never written:** `currentSplit`/`keptRows` need the split signature to match the answers, so after going back and changing one the button is disabled until the new split has loaded. A failed submit gives the primary button focus again, so Enter retries.
- The result is one `useCreateWork` commit, a toast ("Added <group> with 4 issues", or "Added <title>" with **Open**), and the board opens on the new group with Backlog unfolded.

### features/codex: `src/features/codex/**` (plan D3, D4, + Open in Codex and Do next step)

`index.ts` exports `CodexActions, CodexRunMarker, OpenInCodex, OpenInCodexPanel, RunStatus, RunProgress, RunNotice, RunsPopover, RunsList, runLine, runWord,
copyCodexCommand, OPEN_IN_CODEX_HINT, useCodexIssue, useCardRun, useNextStep, useRunActive`. The user asked for "a way to open the codex in a button form, and
beside it a button that in the background does the next step".
- `CodexActions({ issue })` — the issue header's pair of buttons. **Open in Codex** copies `codexCommand(issue).command` (a `codex "Work on wf-xxxxx … Read current_state.md first, then use the wf skills (doing-next-step)"` line;
  the popover's own line "Command copied. Paste it in a terminal at the repo root." is the confirmation, with no toast) and opens `OpenInCodexPanel`, which shows the exact prompt, so nobody pastes a command they have not seen.
  With the local daemon the same button starts Codex itself (D3). **Do next step** starts a background run; while it goes the button's slot becomes `RunStatus` (the live phase
  "Claiming T-3", "Logging the change", "Verifying: CI running", "Finishing T-3", a progress bar, Cancel), and a run with nothing to do says why on a line below with a way to the Plan tab (`RunNotice`).
  `RunsPopover` lists the issue's recent runs. The result of a run is not shown in the strip: it is markdown in the issue (the task, a change entry) plus a commit and a CI run, in the Plan, Log, Git and CI tabs.
- **`CodexActions` has a `children` slot** for more buttons of the same row: the issue header passes `HandoffButton` (**Copy context**, `features/issue/HandoffPanel`), so the row reads `[Open in Codex] [Do next step] [Copy context] [history]`.
  While a run shows (`data-busy` on the root, `group/codex`) Open in Codex and Copy context give way to their glyph below 640 px so the phase keeps its room. The header has no `wf context` icon and copies no CLI string.
- **Do next step plans first.** On an issue without a plan the run's first phase is "Plan the issue, claim T-1" (`CodexRun.plans`): the strip says "Planning, claiming T-1", the card marker "Planning". The button label stays "Do next step" (the Plan tab's empty state too, at every size). A task that ends in `review` (its `verify` is `manual`) ends the run `done` with `CodexRun.review`, and the strip says "Done: T-n, waiting for a check".
- **A run with nothing to do says why, and points where the answer is** (`reasonAction`, `RunNotice onOpen(tab)`): "Waiting on Q-…" → Open Now, "no criteria" → Open goal, tasks in flight or all done → Open plan; "Waiting on <issue>", "The issue is done" and "<author> holds the lease" have no button.
- **The run follows the skills flow** (`mock/codex.ts`, `mock/codex-plan.ts`; `run-copy.ts` has the words): the first phase of a run that plans reads "Plan the issue (<ref>), claim T-1" when the Plan skill is not the built-in one; `finish = review` ends every task in `review`; `commit = none` drops the verify phase; each custom step after Do next step is a phase `custom:<id>` ("Running Security check") between verify and done; every phase may carry `skill` (the strip's tooltip reads "<label> · <skill>"). A required custom step that fails stops the run with a failure entry and a blocking request.
- `CodexRunMarker({ run })` — the card's mark while a run goes (the Codex tile, the task id, one word for the phase), in the id row in place of the group path.
- **One code path per action, so one wording and one toast whichever button started it.** `copyCodexCommand(issue, { toast?: boolean })` is the copy (header: `toast: false`, the popover's line is the confirmation; card menu and palette toast once); `useNextStep(issue)` returns `{ busy, start, cancel }` and starts a run from a place with no strip
  (card menu, palette); `useCodexIssue(issue)` is the header's. **One confirmation per event:** a run that ends while the header's strip shows its result has no toast (the strip is the confirmation); a run started from the card menu or the palette gives one toast
  ("Codex finished T-3 … Open log", or "Codex failed on T-3"); a cancel is the person's own act and has none (the card menu and the palette show "Cancel Codex's run" while a run goes). `follow-run.ts` keeps a counted registry of the mounted header strips (`holdStrip`/`stripShows`): `announce()` is silent while a strip of that issue is on screen. A run with nothing ready is explained at once (the header's `RunNotice`, a toast from the menu and the palette).
- `useRunActive(issueId)` — true while a run goes on the issue and for 1.5 s after (the time the issue takes to be read again). The header's Q005 row and the Now tab's "behind" chip wait on it.
- Run words are in `run-copy.ts` (`runLine`, `runWord`, `runProgress`, `activeRun`): the strip, the card marker, the runs list and the toasts all read a run through them.

### features/skills: `src/features/skills/**` (plan D7, Library · Skills)

`index.ts` exports `SkillsView, SkillItemView, SkillRow, SkillSource, InstallPanel, useSkillsNav, skillHref, validateSkillsSearch`. Goal 1 of the user: **distribute skills and plugins across the team**. **A skill is its reference everywhere** (`ws:acme-planning`, `platform-handbook:checking-security`, `me:planning-small`; a built-in's bare name is its own): `SkillRow {skill, selected, onSelect(ref)}` (`id=skill-row-<ref>`, `data-skill=<ref>`, shows the first rule a skill breaks), `useSkillsNav().select(ref)`, `skillHref(ref)`, the palette's `skill:<ref>`. The list is grouped by source (the plugins, **This workspace**, each team library, **Yours**: `ShelfSection` per `catalog.shelves`), `SkillItemView` takes an optional `shelf` (a source chip, the reference, the `install-skills.sh --from` command), and `InstallPanel` adds **Your own skills** with the Codex and Claude Code `--from` commands per shelf that has skills.
- `SkillsView` (`/skills`, `g s`) — a 44 px top bar that starts with the Library tabs, then by page width (the rail counts): from 900 px the install panel and the list beside the open skill; under 900 px
  and on a phone an open skill is a screen of its own. `?skill=<name>` opens one. Esc closes it.
- `InstallPanel` — says the repository is the team's (`SKILLS_REPO`, `mudit1729/workflow_management`: GitHub redirects the old name there, so the constant stays) and gives the commands to install its plugins, **for two audiences**: for Claude Code "Just me" (`/plugin marketplace add <repo>`, one `/plugin install` per plugin) and
  "Everyone on the repository" (`claude plugin … --scope project`, then commit `.claude/settings.json`; `claudeTeamCommands`, `claudeInstallGroups`), and for Codex two steps (`scripts/install-skills.sh --codex`, which copies the skills to `.agents/skills/`, then `--print-agents-md >> AGENTS.md`; `CODEX_AGENTS_COMMAND`), each with a copy button. They are built from the plugin's own manifests (`claudeInstallCommands`, `codexInstallCommands`), so they do not go stale.
- `SkillRow` — name, description and the plugin; `SkillItemView` — one skill: its plugin, where it lives, `SkillSource` (the SKILL.md read from the file, rendered, with a Rendered | Source switch).
- Data: `useSkills()` reads `plugins/*/skills/*/SKILL.md`, the plugin manifests and `.claude-plugin/marketplace.json` (see the data layer); a saved SKILL.md updates the page in the dev server.
- **The headless skills** are `plugins/workflow/skills/*`: `using-wf`, `adding-work`, `planning-issues`, `doing-next-step`, `logging-work`, `checking-status`, `handing-off` and `writing-readable-bulk-text`.
  They edit the same markdown files in the contract format (there is no `wf` CLI yet), so Codex or Claude can run the whole flow without the UI and the UI shows the result, and a UI edit is just a file for
  Codex: that is the goal "the UI should work without Codex, and Codex should replicate the flow with a set of skills without the UI". `node scripts/wf-lint.mjs <workspace>` (`pnpm wf:lint`) checks a workspace.

### features/settings: `src/features/settings/**` (spec `docs/plan/proposals/skills-flow-spec.md`, Settings)

The user asked for "a settings pane where the entire flow of skills is mentioned and is clickable to change it, like goal skill, plan skill". `/settings` has the tabs **Skills flow**, **Agent** and **Workspace** (`ViewTabs` view `settings`, sub-views `flow | agent | workspace`, shortcut `mod+,`); a gear in the nav footer opens it. The tab title always names the tab ("Settings · Skills flow · wf").
- **`SettingsView({ page })`** (`flow | edit | agent | workspace`) holds the top bar and the page; presentational pieces take a `ResolvedFlow` and a `SkillsCatalog`, so the Kit and the tests need no files (`fixtures.ts`: `FIXTURE_CATALOG`, `FIXTURE_FLOW`, `FIXTURE_TEAM_FLOW`, `fixtureSkill`); the panels use `useFlow()` and the writers of `@/lib/api`.
- **Skills flow tab (`FlowTab`, `FlowMap`, `StepCard`).** A header, a switch **In effect for me | Team default** (`?view=team`; the team's values only), the four steps as cards joined by arrows (Add work → Plan → Do next step → Hand off), Log under Do next step, a **+** (`AddStepButton`) in each gap and after Hand off, custom steps as dashed cards, and an **Anywhere** row (Status, Writing style). A card: name, reference in mono, a source chip (Built-in, This workspace, the library's name, Yours), a dot and "Your override" when I override the team, one options line, and a warning when the reference does not resolve. The flow is a row when there is room (about 700 px plus 140 px per custom step) and a vertical list otherwise (`layoutFor`: 1024 with the panel open, everything under 640). Keyboard: cards and **+** are one tab stop; arrows, Home and End move between them, Enter opens, number keys pick a skill in the panel, Esc closes and returns focus to the card.
- **The step panel (`StepPanel`, `panel.tsx`, `SkillChoices`, `OptionRows`, `SkillActions`).** Title, one line, the **Contract**, **Apply to [Everyone] [Just me]** (Just me is off without a personal library and in the Team default view; a line says what the team uses), numbered skill cards grouped by source (a skill that breaks the rules says "Not a valid skill: <first problem>"; the arrow keys only move focus, because a pick is a write), **Options** as button rows (team-only options are shown disabled under Just me, with "A team setting"; a number in the file the buttons do not offer shows as a fourth button), **Actions** (View skill, Edit, Edit a copy, Reset to the team's choice, Reset to built-in), and under a skill that is not built in the `install-skills.sh --from` command (`InstallNote`). `MoreSkills` says where more skills come from: **Add team library** when none is added (its skills appear on adding it), and a first copy when the cards are only the built-in ones. A pick that equals what lies below it removes the key, so no `[flow.plan]` table is left behind.
- **Custom steps (`CustomPanel`).** `CustomStepPanel` (Label, Runs after, Must pass, the skill, Remove step; the step's own scope: a team step cannot be changed under Just me) and `NewStepPanel` (the same as a form; **nothing is written until Add step**). Label is the one typed field and is optional; without it the card says what the skill is called.
- **One confirmation (`SavedLine`, `saved.ts`).** "Saved to workflow.toml · Undo" (or "your library.toml") is a line on the page where the change was made, never a toast. It belongs to the panel that was open and goes when another panel opens; the store outlives the page, so the editor of a copy saves, goes back and the panel says so.
- **Edit a copy (`CopyDialog`/`CopyPanel`, `SkillEditorPage`, `SkillChecks`, `EditorShell`).** Two screens of buttons (where the copy lives, then its name, prefilled `wf-<name>` or the handle, taken with Enter, checked for the rules and for being free), then `/settings/flow/edit`: the `SourceEditor` of the Files view (it reports the draft through `onDraftChange`) and the `check-skills` rules beside it as you type (above it, in a summary, on a phone). Save writes the folder through `copySkill`, points the step at it and returns to the panel with the saved line. **Edit** of a skill of this workspace or of mine works the same without a copy, and is undoable.
- **Agent tab (`AgentTab`).** The connect button on the seam `openConnectAgent` (`library/team/connect-hook.ts`), a line that the connection arrives with round 2, and "Skills the flow uses" with the install command per place (`flowSkillRefs`).
- **Workspace tab (`WorkspaceTab`, `workspace-write.ts`).** The name and id prefix (read-only, with "Open workflow.toml in Files"), leases [30] [60] [120] minutes (undoable) and the lint rules turned off.
- **Kit.** Group **Settings** (`kit/entries/settings.tsx`): `SettingsView`, `FlowMap`, `StepCard`, `CustomCard`, `AddStepButton`, `StepPanel`, `SkillChoices`, `OptionRows`, `CustomStepPanel`, `NewStepPanel`, `CopyPanel`, `SkillEditorPage`, `SkillChecks`, `SavedLine`, `AgentTab`, `WorkspaceTab`; cards and the flow are drawn from the made-up fixture, so nothing is written, and the panel frames that write are the real ones on the workspace's live mock files.
- **Checks.** `settings.test.tsx` and `search.test.ts` (markup), `views.test.ts` (routes, tabs, title, shortcut), `scripts/sweep.mjs` (the four settings routes, `/skills`, `/kit?el=SettingsView` and `StepPanel`), and the Playwright smoke `scripts/smoke-settings.mjs` (acceptance 2, 3 and 4 of the spec, with Undo after each, on the dev server).

### context builder: `src/features/context/**`

Context from the library: library items, glossary terms, files and decisions an agent should read with an issue. `index.ts` exports
`ContextPicker` (a field with removable chips and an "Add" button that opens a command-style search right under it, in the flow of the form: used
by the New issue and New file dialogs), `ContextSearch`, `ContextPreview` (what the agent will get, against a token budget; draft library items
are marked "not injected until reviewed"), `AddContextButton` (the Goal tab's Links section: a pick is written at once with `useAddLinks`),
`LinkedContext` (the `## Links` bullets as rows, with remove-and-undo), `LinkedPreview`, `useWorkdatabase` (the pickable list, built from the same
queries as the Library, Glossary and Files views) and the link grammar (`links.ts`: `linkLine`, `parseLinkLine`, `parseLinks`).

### kit builder: `src/features/kit/**`

`/kit` is the component gallery (not a view): a left index and one section per element, so the user can review element by element and answer
as "ElementName: change". `?el=<ComponentName>` opens the page at that element's section (for example `/kit?el=IssueCard`); `?view=side` shows
light and dark side by side. Entries live in `entries/*.tsx`, one `entry(...)` per `data-wf` name, and `registry.ts` lists every file in index order.
The groups (`GROUPS` in `kit-ui.tsx`) follow the product: Foundations, Shell, Workflow · Board, Issue · Header, Now, Goal, **Criteria**, Plan, Log, **Git**, **CI**, Files, Diagrams,
Library, **Library · Personal**, **Library · Team**, **Library · Ask**, **Settings**, Shared, Primitives. The library entries: `entries/library.tsx` (`WikiView`, `LibraryHome`, `MarkdownProse (wiki)`, `GlossaryView`,
`PromoteDialog`), `library-parts.tsx` (`PageHeader`, `PageTree`, `RightRail`, `OnThisPage`, `Callouts`, `MediaFigure`, `GifPlayer`, `VideoPlayer`, `EmbedCard`), `library-personal.tsx`
(`PersonalHome`, `TopicsSection`, `CodebasesSection`, `WorkSection`, `SummaryBanner`, `PersonalSetup`), `library-team.tsx` (`AddTeamLibrary · link`, `· folder`, `· preview`, each screen in a framed
surface that runs the real flow and adds nothing) and `library-ask.tsx` (`AskPanel` ready and answered, `AskPanel · states`, `PassageList`, `AskLibraryButton`). There is no "Workflow · Inbox" group. The Add work entries (`entries/add-work.tsx`: `AddWorkDialog` screen by screen,
`ChoiceList`, `ChoiceButton`, `ToggleChip`, `ProgressDots`, `SplitProgress`, `SplitCard`, `SplitStart`, `DiscardDialog`, `NeedsYouToggle`) sit under Shell and
Workflow · Board; the Codex entries (`entries/codex.tsx`: `CodexActions`, `CodexRunStatus`, `CodexRunNotice`, `OpenInCodexPanel`, `CodexRunsList`, `CodexRunMarker`) under Issue · Header and
Workflow · Board; the Skills entries (`entries/skills.tsx`) under Library; `entries/issue-delivery.tsx` holds `CriteriaTab`, `GitTab`, `PullRequestRow`, `CommitRow`, `CiTab`,
`PipelineRow` and `RunStateIcon`; `entries/issue-header.tsx` holds `HandoffPanel` (with the button, compact, and the panel before, after and without the clipboard); `entries/shared.tsx` holds `SkillHint` and `MetaLine`.
The Kit's `EmptyState`, `CopyButton` and `CodeBlock` examples use real skill names and real commands (`codex '…'`), never `wf …`. The legacy `NewIssueDialog`, `NewGroupDialog` and `NewIssueContext` entries are gone with the dialogs. The board's `BoardToolbar` variants pass
`needsYou={{ requests, issues }}`, so the Needs you count shows (and a variant has the filter on). Foundations shows the tokens live (surfaces,
accent and signals, readable signal text, scrim and the z scale, status colors, the hue scale). The "hover footer (forced open)" board variant
forces the footer open with a selector on `IssueCardFooter`; the real footer is an overlay on the card's last row, and so is this one.
The kit names real issues by id (`wf-3k9x2` and so on), and the shipped workspace has none, so `KitPage` holds the sample while the
route is open: on mount it saves the user's working copy and loads the sample (`mockControls.holdSample()`), on unmount it puts the
saved copy back exactly. The hold is counted in the store, so StrictMode and repeated visits cannot corrupt it. What an element
writes in the kit (Edit, Create, Delete, a Codex run, an Add work) goes to the sample copy and is gone when the kit closes. The user's saved prefs are not touched.
The gallery is a lazy chunk (`KitPage` imports `KitGallery` on demand).

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

Its delivery data (commits, pull requests, CI runs: `mock/fixtures/delivery-sample.json`, not markdown, see "Delivery") gives the Git and CI tabs something to show.

About 20 more issues across all statuses and groups showing every signal at least once: needs-you blocking and fyi,
blocked (with `blocked_by`), stale (amber), lease expired, done-but-criteria-unmet drift, in_progress without plan,
xs issue without plan, bad YAML (`wf-7yq2m` "Fix tab-title count": F001, raw file view), cancelled, many lint
warnings, due dates, labels. Plus ~8 library items (all kinds; draft, reviewed, retired, overdue) and the glossary
seed terms (contract 1.4 + §2).
