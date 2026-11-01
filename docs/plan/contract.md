# `workflow` (`wf`): canonical contract, wf_format 1

Status: FROZEN for the plan writers (2026-10-22). Every section writer follows this file exactly. If a section needs something this file does not define, it adds it as an assumption in section 17. It does not invent a conflicting alternative.

---

## Part 1: Canonical contract

### 1.1 Product principles

1. **An issue is just a folder of markdown files.** Files are the only truth. The index and `.wf/` are rebuildable caches.
2. **A text editor plus git is enough.** `wf` writes nothing a human cannot write by hand.
3. **Tolerant reader, strict writer.** The parser always displays a file. Bad input renders as plain markdown with lint. `wf` writes canonical form.
4. **Surgical, safe writes.** Lock, hash check, splice only the target bytes, atomic rename. Never re-serialize frontmatter.
5. **One contract.** Spec, parser, skills, lint and UI agree, enforced in CI by golden fixtures and every SKILL.md `wf-example`.
6. **Evidence over claims.** *Verified* (has evidence) is distinct from *claimed* (ticked).
7. **Single writer, many appenders.** A coordinator writes `goal.md`, `plan.md` and `current_state.md`. Workers claim tasks and append entries. Parallel work uses disjoint `owns:` globs.
8. **Lean context.** Agents read the budgeted `wf context` bundle, not whole folders.
9. **No LLM calls, no auto-commits inside `wf`.**
10. **Calm & precise UI.** Neutral grays, one accent, color only for status, author or group. Progressive disclosure. Minimal page scroll.

### 1.2 Workspace and issue folder

```
<workspace>/                    # a git repo the team shares
  workflow.toml                 # config; holds wf_format = 1
  glossary.md                   # one term, one meaning
  authors.md                    # roster (not agents.md: clashes with AGENTS.md on APFS)
  AGENTS.md                     # optional; `wf instructions` prints it
  .gitattributes                # changes.md decisions.md learnings.md merge=union
  .wf/                          # gitignored: cache/archify/, locks/, daemon.json
  issues/                       # issues_dir; the root group
    _group.md
    platform/                   # group (a folder with _group.md, or an implicit group)
      _group.md
      auth/                     # nested group
        sso-login/              # issue = a folder that contains goal.md
          goal.md  plan.md  current_state.md  changes.md  decisions.md  learnings.md
          notes/research.md     # extra .md: listed and rendered as plain docs
          evidence/  assets/    # any files; images render inline
  library/
    patterns/  playbooks/  gotchas/  decisions/   # <slug>.md library items
```

Rules:
- A folder with `goal.md` is an issue. Issues are leaves; their subfolders are not scanned for issues. To split an issue, convert it into a group (`split-issue`).
- A folder with `_group.md` is a group. A folder with issues but no `_group.md` is an implicit group named after the folder. A folder with both files is an issue with F008.
- Only `goal.md` is required. A missing file shows an empty state that names the skill that creates it.
- The scanner ignores `.git/`, `.wf/`, `node_modules/`, `.DS_Store`, `*.swp`, `*~`, `.#*`, `4913`, `.wf-tmp-*`.

Lifecycle per file: `goal.md` = why plus criteria (stable). `plan.md` = how (revised). `current_state.md` = now (overwritten). `changes.md`, `decisions.md` and `learnings.md` = append-only logs.

### 1.3 Shared grammar

- **IDs.** Random IDs are 5 lowercase Crockford base32 chars (`0-9a-hjkmnp-tv-z`): issue `wf-3k9x2` (`id_prefix`), group `g-8m2qa`, library `lib-4tz7c`, change `C-7k2q9`, decision `D-…`, learning `L-…`, request `Q-…`. `SC-n` and `T-n` are sequential (one writer per file). Issue and group IDs are immutable; URLs use them.
- **Timestamps.** RFC 3339 with offset, minute precision or finer: `2026-10-22T14:05+05:30`. Date-only is S13 (info). Activity times come from file content, never mtime.
- **Authors.** `@handle`, matching `[a-z0-9][a-z0-9._-]*`. The value resolves from `--author`, then `WF_AUTHOR`, then an error. The UI acts as `wf serve --author`, or `[server] author`.
- **References.** `[[wf-3k9x2]]` is an issue. `[[wf-3k9x2#D-7f3k2]]` is an entry, criterion or task in that issue. `[[#T-4]]` is in the same issue. `[[lib-4tz7c]]` is a library item.
- **Meta list.** A bullet list of `- key: value` items (key `[a-z_]+`), directly under an entry, task, term or author heading (no blank line), or nested under a checklist item. It ends at the first blank or non-matching line. Lists are comma-separated; backticks are stripped; unknown keys are kept (F006 info).
- **Entry heading (changes, decisions, learnings):**

```
^## (?P<ts>\S+) @(?P<author>[a-z0-9][a-z0-9._-]*) (—|-) (?P<title>.+?) \{#(?P<id>[CDL]-[0-9a-hjkmnp-tv-z]{5})\}$
```

Writers use ` — ` (parser also accepts ` - `). Entries are appended at the bottom; the UI sorts by `ts`. Entries are never edited, except a decision's `status` meta key. Corrections are new entries with `supersedes:`.

### 1.4 Frontmatter per file

Type notation: `str`, `int`, `date`, `ts`, `@h` (handle), `[T]` (list), `enum(a|b)`. ✱ means required. Unknown keys are kept (F006 info).

**workflow.toml:** `wf_format✱ int = 1`; `[workspace] name, issues_dir="issues", library_dir="library", id_prefix="wf"`; `[leases] minutes=60`; `[staleness] issue_hours=24, task_hours=4`; `[context] budget_tokens=6000, changes=5, library=3`; `[archify] home="~/.claude/skills/archify", quality="showcase", concurrency=2, timeout_s=90`; `[flow.<step>] skill, <option>` for the steps `add plan do log handoff status style` and `[flow.custom.<id>] after✱ skill✱ label required=false order=1` (the skills flow, scalars only; see `docs/plan/proposals/skills-flow-spec.md`); `[lint] disable=[], severity={}`; `[server] port=7777, author`.

**_group.md**

| field | type | req | default |
|---|---|---|---|
| id | str `g-…` | ✱ | generated |
| title | str | ✱ | folder name |
| goal | str (one line) | | — |
| owner | @h | | — |
| color | int 1–8 | | hash of id |
| order | int | | 0 |
| definition_of_done | [str] | | [] (inherited by child issues) |

Body: free markdown. Archify blocks are allowed.

**goal.md**

| field | type | req | default |
|---|---|---|---|
| id | str `wf-…` | ✱ | generated |
| title | str | ✱ | — |
| status | enum (see 1.6) | ✱ | backlog |
| priority | enum(urgent\|high\|medium\|low\|none) | | none |
| size | enum(xs\|s\|m\|l) | | m |
| owner | @h | | — |
| labels | [str] | | [] |
| claimed_by | @h (coordinator) | | — |
| lease_until | ts | | — |
| blocked_by | [issue id] | | [] |
| due | date | | — |
| created | ts | ✱ | now |

Body sections (H2, in order): `## Context` (why; 1–2 paragraphs) ✱, `## Success criteria` ✱, `## Out of scope`, `## Links`. Archify blocks may appear in any section.

**plan.md**

| field | type | req | default |
|---|---|---|---|
| updated_at | ts | ✱ | — |
| updated_by | @h | ✱ | — |
| revision | int | | 1 |

Body: `## Approach` (short prose, may hold an archify block), `## Assumptions` (`- A1: … [open]` or `[confirmed]`), `## Prior art` (library refs), then `## Phase N: <name>` sections that contain tasks (1.5). Tasks before the first phase belong to the phase "Unphased".

**current_state.md** (overwritten as a whole by `wf state`)

| field | type | req | default |
|---|---|---|---|
| summary | str ≤120 chars, present tense | ✱ | — |
| updated_at | ts | ✱ | — |
| updated_by | @h | ✱ | — |
| phase | str (plan phase name) | | — |
| library_refs | [lib id] | | [] |
| session | str | | — |

Sections: see 1.5.

**changes.md, decisions.md, learnings.md.** No frontmatter. An optional `# Changes` H1 comes first, then entries.

**Library item** (`library/<kind>s/<slug>.md`)

| field | type | req | default |
|---|---|---|---|
| id | str `lib-…` | ✱ | generated |
| title | str | ✱ | — |
| kind | enum(pattern\|playbook\|gotcha\|decision) | ✱ | — |
| description | str, starts "Use when…", ≤300 chars | ✱ | — |
| status | enum(draft\|reviewed\|retired) | ✱ | draft |
| tags | [str] | | [] |
| applies_to | [glob or keyword] | | [] |
| source | [ref] | ✱ | — |
| authors | [@h] | ✱ | — |
| reviewed_by | @h | | — |
| created | date | ✱ | — |
| last_reviewed | date | | — |
| review_after | date | | created + 180 d |
| superseded_by | lib id | | — |

Body sections by kind:
- pattern: `## Rule`, `## When to use`, `## Example`, `## Evidence`
- gotcha: `## Symptom`, `## Cause`, `## Fix`, `## Evidence`
- playbook: `## Overview`, `## Procedure` (numbered, imperative), `## Done when`, `## Forbidden`
- decision: `## Decision`, `## Because`, `## Rejected`, `## Revisit when`

**glossary.md.** No frontmatter. One `## <term>` per term, with a meta list: `kind✱ enum(noun|verb|adj)`, `means✱ str`, `avoid [str]`, `see [term]`. Seed terms: workspace, group, issue, entry, change, decision, learning, criterion, task, lane, lease, author, library item, promote, append, archify block, needs-you request.

**authors.md.** No frontmatter. One `## @handle` per author, with a meta list: `kind✱ enum(human|agent)`, `name`, `runtime enum(claude-code|codex|cursor|other)`, `model`, `color int 1–8`, `lanes [str]`, `max_leases int=3`.

### 1.5 Body syntax by file

**Success criteria (EARS).** Checklist items under a heading matching `/success criteria|acceptance/i`: `- [ ] SC-n: <EARS sentence>`. Optional nested meta list: `verify` (command or `manual`), `evidence` (written by `wf check`), `verified_by` (@h), `scenario` (`Given … / When … / Then …`). Patterns: ubiquitous `The <system> shall …`; event `When …,`; state `While …,`; optional `Where …,`; unwanted `If …, then …`; complex = 2+ keywords. `must` equals `shall`.

Parser: (1) strip the checkbox and `SC-n:`; (2) strip each leading `(while|when|if|where) … ,` clause, then `then`; (3) match `(?:the )?<system> (shall|must)( not)? <response>`; (4) classify; no match = `freeform` (S08 info); (5) `measurable` = number with unit, date, backticked literal, or a `verify:` child. State: `open` = `[ ]`; `claimed` = `[x]` without `evidence`; `verified` = `[x]` with `evidence`.

```markdown
## Success criteria
- [ ] SC-1: When an agent appends to `changes.md`, the board shall show the entry within 2 s.
  - verify: `cargo test -p wf-index live_append`
- [x] SC-2: If `goal.md` frontmatter is invalid, then the drawer shall show a lint finding and the raw file.
  - verify: manual
  - evidence: screenshot `evidence/sc2.png`, checked by @shruti
```

**Plan tasks.** A task is an H3 inside a phase: `### T-n: <imperative title>`, with a meta list. Then comes an optional self-contained brief (prose). Then come optional step checkboxes `- [ ] …` (each gives one step of progress).

| key | type | default |
|---|---|---|
| status | enum(todo\|in_progress\|blocked\|review\|done\|cancelled) | todo |
| lane | str | `main` |
| depends_on | [T-n or `wf-…#T-n`] | [] |
| owns | [glob] | [] |
| satisfies | [SC-n] | [] |
| assignee | @h or `role:<name>` | — |
| claimed_by | @h | — |
| lease_until | ts | — |
| verify | command or text | — |

A task is **ready** when all four hold:
- `status: todo`
- every `depends_on` task is `done`
- it has no live lease
- its `owns` globs do not overlap any live lease anywhere in the workspace (prefix match)

A task is **stale** when it is `in_progress` and has no change entry with `task: T-n` and no lease renewal within `task_hours`.

```markdown
## Phase 1: Live updates
### T-3: Build the SSE delta stream
- status: in_progress
- lane: server
- depends_on: T-1, T-2
- owns: `crates/wf-server/src/sse.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- lease_until: 2026-10-22T16:05+05:30
- verify: `cargo test -p wf-server sse`

Stream `delta` events from the index broadcast. Send `snapshot` on connect.
- [x] Add the `GET /api/events` route.
- [ ] Answer a lagged client with `resync`.
```

**current_state.md sections** (H2, exactly this order; empty sections may be omitted):
`## Done` → `## In flight` → `## Blocked` → `## Needs you` → `## Failed attempts` → `## Handoff notes` → `## Next steps`.

`Next steps` is numbered; item 1 is the one next action. `Done` holds pointers only. `Failed attempts` has one line each with the error signature. The file is ≤400 words (Q008).

**Needs-you request** (inside `## Needs you`):

```markdown
## Needs you
- [ ] Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?
  - from: @claude-opus
  - to: @shruti
  - kind: approval
  - urgency: blocking
  - asked: 2026-10-22T14:10+05:30
  - options: approve, reject
  - ref: [[#D-7f3k2]]
  - answer:
```

`kind`: question | approval | input. `urgency`: blocking | fyi. A human answers by ticking `[x]` and filling `answer:` (by hand, `wf answer` or the UI, which also writes `answered_by` and `answered_at`). The resuming agent runs `wf resolve`: it removes the item and appends a `kind: answer` change entry holding Q and A, so nothing is lost on overwrite.

**Change entry.** Meta keys: `kind` (progress (default) | fix | refactor | docs | test | research | review | verify | failure | answer), `task`, `criteria` [SC], `result` (pass | fail), `evidence`, `commit`, `pr`, `files` [path], `session`, `model`. Body: past tense, one change.

```markdown
## 2026-10-22T14:05+05:30 @codex — Added the SSE delta stream {#C-7k2q9}
- kind: progress
- task: T-3
- commit: 9f1e2ab
- files: `crates/wf-server/src/sse.rs`

Added `GET /api/events`. A lagged client now gets `resync`.
```

**Decision entry (ADR).** Meta keys: `status` enum(proposed|accepted|rejected, mutable), `topic`, `supersedes` D-id, `affects` [SC], `decided_by` [@h]. Body uses bold labels, with the point first: `**Decision:**`, `**Because:**`, `**Rejected:**`, `**Consequences:**`, `**Revisit when:**`. A decision is *superseded* when a later entry has `supersedes:` pointing to it. This status is derived.

```markdown
## 2026-10-22T15:00+05:30 @claude-opus — Push board updates over SSE {#D-7f3k2}
- status: accepted
- topic: live-transport

**Decision:** Use SSE for board updates.
**Because:** Data flows one way. SSE reconnects with `Last-Event-ID`.
**Rejected:** WebSocket (two-way, more code); polling (latency above 2 s).
**Revisit when:** The UI needs to send updates over the live channel.
```

**Learning entry.** Meta keys: `kind` enum(tip|gotcha|pattern), `tags`, `applies_to`, `promote` enum(no|candidate)=no. The body states the rule first, then the evidence (≤3 lines). "Promoted" is derived from library `source:` backlinks, so the learning entry is never edited.

**Archify block.** It is a fenced block in any workspace `.md` file (the skills put them in goal.md and plan.md). The info string is `archify <type>`, with type ∈ {architecture, workflow, sequence, dataflow, lifecycle}. An optional `id=<slug>` names a stable anchor. The body is an archify JSON candidate. Render rules:
- The daemon overrides `meta.output`.
- `hash = blake3(type ‖ 0x00 ‖ body bytes ‖ 0x00 ‖ archify version)`.
- A block whose info string has a different type or invalid JSON is F010.
- A failed render is F011, with archify's errors.
- `wf context` and `wf show --agent` replace each block with a stub: `[diagram workflow "Deploy" · 14 nodes · plan.md:40]`.

````markdown
```archify workflow id=release-flow
{ "meta": { "title": "Release flow" }, "nodes": [ … ], "edges": [ … ] }
```
````

### 1.6 Status enum and transitions

The enum is `backlog → planned → in_progress → blocked → review → done`, plus `cancelled`. The source of truth is `goal.md` `status:`.

| from | allowed to |
|---|---|
| backlog | planned, in_progress, cancelled |
| planned | in_progress, backlog, cancelled |
| in_progress | blocked, review, done, planned |
| blocked | in_progress, cancelled |
| review | in_progress, done |
| done | in_progress (reopen) |
| cancelled | backlog |

How transitions are enforced:
- The CLI and server refuse an illegal transition with a steering error unless `--force` is given (in the UI: "Move anyway").
- Hand edits are always accepted. An illegal transition seen in the git diff is Q015 (v1.1).
- A soft gate appears on the move to `done` when criteria are unverified or leases or requests are open. It lists the gaps and asks for confirmation.
- `size: xs` or `s` may skip `plan.md`.

**Derived signals** (never stored): `done_unmet` (Q001), `in_progress_no_plan` (Q002), `stale` (amber, Q003: in_progress with no change entry and no `current_state.updated_at` within `issue_hours`), `lease_expired` (Q004), `state_behind_changes` (Q005), `needs_you` counts.

Progress: `criteria {total, claimed, verified}`, `tasks {total, todo, in_progress, blocked, review, done, ready}`, and `percent = (claimed + verified + done tasks) / (criteria + tasks)`, used only for group roll-ups.

### 1.7 Lint

Rule IDs: `F0xx` format (wf-parse), `Q0xx` workflow (wf-index), `S0xx` writing standard (wf-lint). The canonical list is in Part 3, §4. Lint never blocks display.

### 1.8 Rust crates

The workspace uses edition 2024, resolver 3 and rust-version 1.89. It builds one binary, `wf`.

| crate | responsibility | key deps |
|---|---|---|
| `wf-model` | Typed structs and enums; ID and timestamp types; `ts-rs` export to `web/src/gen/`. No IO. | serde, ts-rs 12, jiff |
| `wf-parse` | Parses each file kind into the model with byte spans; meta-list grammar; EARS classifier; reference and archify-block extraction; F rules | comrak 0.57 (no default features), serde-saphyr 2.0 (Spanned), blake3 |
| `wf-lint` | S rules over comrak text nodes; glossary automaton; secret patterns (Q011) | wf-parse, aho-corasick, unicode-segmentation |
| `wf-edit` | Locks, atomic writes, surgical ops (frontmatter key splice, checkbox toggle, meta-key set, entry append, state overwrite, request answer and resolve), ID generation, scaffolding from minijinja templates | tempfile, minijinja 3, std `File::lock` |
| `wf-archify` | Finds node and archify; runs `finalize` in a temp dir (semaphore of 2, timeout); content-hash cache; injects the bridge script; reports availability | tokio::process, blake3 |
| `wf-index` | Scan (ignore); watch (notify 8.2 plus debouncer-full 0.7, ~250 ms; events are dirty hints); `ArcSwap<Snapshot>`; diff to `Delta`; roll-ups; signals; ready queue; Q rules; backlinks; BM25 search; `context` bundle | wf-parse, wf-lint, wf-archify, arc-swap |
| `wf-server` | axum 0.8 routes, SSE broadcast, ops endpoint, rust-embed SPA with `index.html` fallback, Host and Origin checks, binding to 127.0.0.1 | axum, tower-http 0.7, rust-embed 8 |
| `wf-cli` (bin `wf`) | clap command table, `--json` output, hook handlers | clap 4.6, clap_complete, open |

The CLI needs no daemon (it indexes in-process) and shares the daemon's lock files.

### 1.9 CLI (`wf …`)

Global flags: `--root` (else `WF_ROOT`, else walk up to `workflow.toml`), `--author`, `--json` (versioned `{"wf_format":1,…}`), `--quiet`.

| command | purpose |
|---|---|
| `wf init [--prefix wf]` | Create workflow.toml, glossary.md, authors.md, `issues/`, `library/`, `.gitattributes` and `.gitignore` lines |
| `wf serve [--port 7777] [--open] [--dev]` | Run the daemon and the dashboard |
| `wf new group <path> [--title --color --owner]` | Scaffold a group |
| `wf new issue <group-path>/<slug> --title … [--template default\|bug\|research\|doc] [--size]` | Scaffold `goal.md` (other files are created on first write) |
| `wf move <issue> <status> [--force]` | Change status |
| `wf append <issue> change\|decision\|learning --title … [--body …\|--body-file -] [--meta k=v]…` | Append an entry atomically; prints its ID |
| `wf state <issue> --from <file\|->` [`--base <rev>`] / `wf state <issue>` | Overwrite or print current_state |
| `wf ask <issue> --to @h --kind … --urgency … "<question>"` / `wf answer <issue> Q-id "<answer>"` / `wf resolve <issue> Q-id` | The needs-you request cycle |
| `wf next [--issue] [--lane] [--as @h] [--claim] ` | Ready queue; `--claim` claims the task atomically |
| `wf claim <issue>[#T-n] [--minutes] [--steal]` / `wf release …` / `wf heartbeat …` | Leases. Heartbeat rewrites `lease_until` only when less than 50% of the lease remains |
| `wf task <issue>#T-n --status <s>` | Set a task's status |
| `wf check <issue> SC-n\|T-n.k [--evidence …] [--uncheck]` | Tick a criterion or a step |
| `wf verify <issue> [SC-n]` | Run `verify:` commands (CLI only, never from the server); append `kind: verify` entries |
| `wf decide <issue> D-id accept\|reject` | The only mutation allowed on a log entry |
| `wf context <issue> [--budget 6000] [--format md\|json]` | Handoff bundle |
| `wf show <issue> [--agent]` | Print the files; `--agent` stubs archify blocks |
| `wf status [--brief]` | Workspace summary, inbox and my leases |
| `wf lint [paths…] [--render] [--secrets] [--staged] [--strict]` | Lint; `--render` runs archify |
| `wf doctor` | Conflict markers, duplicate IDs, orphan leases, archify and node availability, wf_format |
| `wf search "<q>" [--scope library\|issues\|all] [--k 5]` | BM25 search |
| `wf promote <issue>#L-id\|D-id --kind … [--slug]` | Create a draft library item and a needs-you review request |
| `wf library approve\|retire <lib-id>` / `wf library audit` | Library review and audit |
| `wf glossary add\|check` | Glossary |
| `wf skills install [--target agents\|claude\|cursor]` / `wf skills lint` | Distribute skills |
| `wf hook session-start\|stop\|pre-compact\|post-tool-use` | Hook entry points; read the hook JSON on stdin |
| `wf instructions` | Print the agent primer (the AGENTS.md snippet, ≤60 lines) |
| `wf completions <shell>` | Shell completions |

Errors steer: "unknown kind 'decison'; use change|decision|learning".

### 1.10 HTTP API and SSE

Binds 127.0.0.1; POSTs check `Host` and `Origin`; bodies are `wf-model` JSON.

| method + path | response |
|---|---|
| `GET /api/snapshot` | `WorkspaceSnapshot {rev, config, groups: GroupNode (tree with rollup), issues: IssueSummary[], inbox: NeedsYouItem[], library: LibrarySummary[], authors: Author[], diagnostics_count}` |
| `GET /api/issues/{id}` | `IssueDetail {summary, goal, criteria: Criterion[], plan: Plan{phases: Phase[{tasks: Task[]}], assumptions}, state: CurrentState?, changes: Entry[], decisions: Entry[], learnings: Entry[], docs: DocFile[], diagrams: Diagram[], diagnostics: Diagnostic[], backlinks: Ref[], files_rev: {file: rev}}` |
| `GET /api/library/{id}` | `LibraryItemDetail` |
| `GET /api/search?q=&scope=&k=` | `SearchHit[] {kind, id, title, snippet, score, path}` |
| `GET /api/context/{id}?budget=` | `text/markdown` bundle (the same as the CLI) |
| `GET /api/files/{*path}` | Raw file (markdown or asset), `ETag: rev`; the path stays inside the workspace |
| `GET /api/diagrams/{hash}.html` | Cached archify HTML with the bridge injected; `Cache-Control: immutable` |
| `GET /api/events` | SSE stream |
| `POST /api/ops` | `Op` → `200 OpResult {rev, file_rev, issue?: IssueSummary}` / `409 Conflict {reason, current}` / `422 {diagnostics}` |
| `GET /api/health` | `{version, wf_format, archify: available\|unavailable, rev}` |

Prose travels as markdown fragments (`*_md`), rendered by the client; Rust replaces each archify fence with ```` ```wf-diagram\n<diagram_id>\n``` ````. Editable elements carry `EditRef {file, rev, anchor}` (anchor: `SC-2`, `T-3`, `T-3.2`, `Q-4m2pz`, `status`).

`Op` (tagged by `op`, all carry `base_rev`): `set_status {issue, status, force?}`, `toggle_criterion {issue, id, checked}`, `set_task_status {issue, task, status}`, `toggle_step {issue, task, index, checked}`, `answer_request {issue, id, answer}`, `promote {issue, entry, kind, slug?}`, `new_issue {group, slug, title, template}`, `new_group {parent, slug, title, color?}`, `approve_library {id}`.

**Write protocol:** lock `.wf/locks/<blake3(relpath)>.lock` → read → if hash ≠ `base_rev`, re-parse and re-find the anchor → if the target value differs from what the client saw, 409 → splice → atomic write (`.wf-tmp-*`, fsync, keep permissions, rename, fsync dir) → update the index from the written bytes and broadcast. The watcher echo then matches the hash and is ignored.

**SSE events** (`id:` = rev; ring buffer of 256 events; `Last-Event-ID` replays them, and a gap gets `resync`):
- `snapshot`: WorkspaceSnapshot
- `delta`: `{rev, issues_upserted, issues_removed, groups?, inbox?, library_upserted, library_removed, details_changed: id[]}`
- `activity`: `{rev, issue_id, kind: change|decision|learning|state|status|request|lease, author, title, ts}`
- `diagram`: `{hash, status: rendering|ready|invalid|unavailable, errors[]}`
- `resync`: `{}`
- keepalive comments every 15 s

### 1.11 Frontend

**Stack:** React 19.3.1, Vite 8.3.5, TypeScript 7.0.2 + Biome 2.6.2, TanStack Router 1.170 + Query 5.104, Tailwind 4.3.3, shadcn 4.22 / radix-ui 1.8, @atlaskit/pragmatic-drag-and-drop 4.0.0, react-resizable-panels 4.14.8, cmdk 1.1.1, sonner 2.0.8, lucide-react 1.61, zustand 5 (UI preferences only), react-markdown 10.1 + remark-gfm 4 + rehype-sanitize 6, shiki 4.5 (lazy), @tanstack/react-virtual 3.14, vitest 5, Playwright 1.64. Search runs on the server; there is no client index. The data layer reads the API or static JSON.

**Routes:** `/w` (board; params `group`, `swim`, `author`, `q`, `show`), `/w/i/$id` (board + drawer, `?tab=`), `/i/$id` (full page), `/lib`, `/lib/$id`, `/inbox`.

**Top-level components:** shell `AppShell`, `NavRail`, `GroupTree`, `InboxView`, `CommandPalette`, `ShortcutsDialog`; board `BoardToolbar`, `KanbanBoard`, `KanbanColumn`, `Swimlane`, `IssueCard`; issue `IssueDrawer`, `IssuePage`, `IssueView`, `IssueHeader`, `StateSnapshot`, `NeedsYouList`, `CriteriaChecklist`, `ProgressRing`, `CoverageStrip`, `PlanLanes`, `PlanList`, `TaskPill`, `ChangesTimeline`, `DecisionCards`, `LearningCards`, `ArchifyCard`, `DiagramDialog`, `DocsList`, `DocView`, `MarkdownProse`, `LintPanel`, `LintBadge`; library `LibraryView`, `LibraryItemView`, `PromoteDialog`; shared `AuthorChip`, `AuthorStack`, `StatusIcon`, `StatusSelect`, `RelativeTime`, `EmptyState`, `Toaster`.

**Drawer tabs:** `Now · Goal · Plan · Log · Files`. Log has a segmented control: Changes | Decisions | Learnings. The full page uses three independently scrolling columns: [Now + Goal] [Plan] [Log]. "Open in new page" (↗, shortcut `o`) goes to `/i/$id`.

### 1.12 Design tokens (CSS custom properties, `web/src/styles/tokens.css`)

| token | light | dark |
|---|---|---|
| `--wf-bg` | #FFFFFF | #0F0F11 |
| `--wf-bg-subtle` | #F7F7F8 | #151517 |
| `--wf-bg-muted` | #EFEFF1 | #1C1C1F |
| `--wf-border` | #E5E5E8 | #26262A |
| `--wf-border-strong` | #D3D3D8 | #34343A |
| `--wf-text` | #18181B | #EDEDEF |
| `--wf-text-muted` | #5F5F6B | #A1A1AA |
| `--wf-text-faint` | #8E8E99 | #6E6E78 |
| `--wf-accent` / `--wf-accent-subtle` / `--wf-accent-fg` | #5E6AD2 / #EEF0FB / #FFFFFF | #7C85E0 / #1E2040 / #FFFFFF |
| `--wf-focus` | accent at 40% | accent at 50% |
| `--wf-status-{backlog,planned,in_progress,blocked,review,done,cancelled}` | #A1A1AA, #71717A, #3B82F6, #E5484D, #8E4EC6, #30A46C, #A1A1AA | same hues, +8% lightness |
| `--wf-signal-stale` (amber) / `--wf-signal-danger` / `--wf-signal-needs-you` | #D99A06 / #E5484D / var(--wf-accent) | #F5B730 / #FF6369 / accent |
| `--wf-hue-1…8` (authors, groups) | 8 mid-chroma hues, chosen with the validator in section 6 | same |

Other tokens:
- Type: `--wf-font-sans` (bundled Inter Variable, then system stack), `--wf-font-mono` (ui-monospace, SF Mono, Menlo); `--wf-text-xs|sm|base|md|lg|xl` = 11/12/13/14/16/20 px; `--wf-leading` 1.45, `--wf-leading-tight` 1.25; weights 400/500/600.
- Space (4 px grid): `--wf-space-0_5|1|2|3|4|5|6|8` = 2/4/8/12/16/20/24/32. Radii `--wf-radius-sm|md|lg` = 4/6/8. `--wf-hairline` = 1px solid var(--wf-border).
- Motion: `--wf-dur-1|2|3` = 100/150/200 ms, `--wf-ease` cubic-bezier(0.2,0,0,1); reduced motion sets 0.
- Elevation: only `--wf-shadow-pop` (0 4px 16px rgb(0 0 0/.08) + 1px border) for menus, popovers, dialogs, overlay drawer.
- Layout: `--wf-nav-w` 232, `--wf-nav-w-collapsed` 52, `--wf-topbar-h` 44, `--wf-drawer-w` 560 (440–760), `--wf-col-w` 264, `--wf-col-w-folded` 36, `--wf-card-gap` 6. `data-density="compact|comfy"` rescales space.

### 1.13 Plugins, skills, hooks

The repo is a marketplace: `.claude-plugin/marketplace.json` (`name: workflow-marketplace`) lists three plugins under `plugins/`. Skill names are kebab-case and match their directories.

| plugin | skills |
|---|---|
| `workflow` | `using-workflow` (router; links the flowchart), `write-goal`, `write-plan`, `write-current-state`, `log-change`, `log-decision`, `log-learning`, `ask-human`, `claim-task`, `resume-issue`, `split-issue`, `close-issue` |
| `library` | `search-library`, `promote-to-library` (disable-model-invocation), `curate-library`, `maintain-glossary`, `author-skill` |
| `agent-execution` | `execution-guidelines` (Karpathy-derived, MIT, credited), `verify-before-done`, `debug-systematically`, `test-first`, `dispatch-subagents`, `review-work` (`context: fork`), `keep-context-lean` |

Every writer and appender skill holds `## Format contract (wf_format 1)` (template), examples fenced as ```` ```markdown wf-example <filename> ```` (4 backticks if they hold an archify block), render guidance, and a self-check loop (`wf lint <file> --json`; fix all errors and warnings; max 3 rounds). CI parses every `wf-example` and requires zero findings at warn or above. Appenders call `wf append`; `write-current-state` calls `wf state`.

Hooks (`plugins/workflow/hooks/hooks.json`, each calls `wf hook <name>`): `session-start` (SessionStart startup|resume|clear|compact; injects `wf context` for the active issue, resolved from `WF_ISSUE`, then my live lease, then branch `wf/<issue-id>/…`, else `wf status --brief`); `stop` (blocks once if I hold a lease, work changed and current_state is not updated this session; respects `stop_hook_active`); `pre-compact` (reminds to write current_state); `post-tool-use` (Edit|Write|MultiEdit|Bash; renews the lease, throttled to 5 min; lints an edited workspace file into `additionalContext`).

Other agents (Codex, Cursor): `wf skills install --target agents` copies the skills into `.agents/skills/` and prints the AGENTS.md snippet.

### 1.14 v1 scope vs later

**v1:**
- the 6 files plus extra docs; nested groups with roll-ups
- kanban with drag write-back; drawer and full page; all rich components
- archify render and cache
- the library with its review gate; glossary; authors roster
- all lint rules except F015 and Q015
- leases, staleness and `wf next`
- the needs-you inbox (badges, tab-title count, opt-in browser notifications for blocking requests)
- `wf context`, the 4 hooks and `wf verify`
- the 3 plugins, the skills flowchart, `wf skills install`, conformance CI

**v1.1:**
- `wf mcp`; archify `src=` sidecar files
- scope check against the git diff; goalpost-move detection (F015, Q015)
- git and PR linkage; log rollover and archive
- "since you last looked" markers and snapshot history
- pause and stop; library similarity merge
- digests, cost ledger and webhooks; group `_glossary.md`

**Later:** static export, dispatcher, multi-workspace, inline review comments.

---

## Part 2: Key design decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Files are the only truth; the index is an in-memory `ArcSwap<Snapshot>` | SQLite or a DB; tasks.json | User requirement. vibe-kanban lost tasks on upgrade. Rebuilding is under 1 s for thousands of files. |
| `current_state.md` is overwritten through `wf state` with a base-hash check | Append-only progress log; a section in plan.md | User requirement. Anthropic and Manus guidance on "a short progress file read first". The hash check stops blind overwrites. |
| Single coordinator per issue (`goal.md` `claimed_by`); workers claim tasks | Free-for-all concurrent writers | Cognition and Cursor: keep writes single-threaded. Disjoint `owns:` still gives parallel work. |
| Log entries are H2 headings with timestamp, `@author`, title and `{#ID}`, plus a meta list | YAML blocks per entry; one file per entry; HTML section markers | Reads well raw and on GitHub. Regex-parseable. Union-merge friendly. One grammar for entries, tasks, terms and authors. |
| Random 5-character base32 IDs for issues and entries; sequential `SC-n` and `T-n` | ULID; sequential `D-7` | Short enough to type, and they never collide across branches. Sequential IDs work only where one writer owns the file. |
| Append at the bottom, `merge=union`, and the UI sorts by `ts` | Newest first at the top | Appends never conflict. Union merge keeps both sides. |
| Learning "promoted" state and decision "superseded" state are derived from backlinks | Mutating old entries | Keeps the logs append-only. The only mutable entry key is a decision's `status`. |
| Explicit `status:` in goal.md; illegal transitions refused unless forced | Status derived from checkboxes | User default. 12-factor: own the control flow. Drift is flagged, never auto-fixed. |
| Verified vs claimed criteria (`evidence:`) | Count ticked boxes only | Agents grade themselves leniently (Anthropic, Osmani). Karpathy: goal-driven work needs a verifiable check. |
| EARS criteria and STE-based style rules are warnings only | Blocking validation | The user wants lint warnings. "Never refuse to display." |
| comrak 0.57 for parsing, serde-saphyr 2.0 `Spanned` for surgical frontmatter edits | pulldown-cmark; serde_yaml (deprecated) | Verified: checkbox sourcepos, the full info string, and byte-exact splicing that keeps comments. |
| Ops address targets by stable anchor ID plus `base_rev`; re-locate when the hash differs | Raw byte spans from the client | Survives concurrent agent edits elsewhere in the file. A conflict returns 409 instead of a wrong write. |
| Echo suppression by content hash | Time windows | Deterministic. Also absorbs FSEvents replays. |
| Watcher events are only dirty hints; a subtree is rescanned and compared by hash | Trusting notify events | Verified: notify 8.2 drops removes and renames on macOS. |
| One `POST /api/ops` write endpoint that mirrors the CLI verbs | Many PATCH routes | One write path and one lock protocol; the server and the CLI cannot drift apart. |
| SSE (`snapshot`, `delta`, `activity`, `diagram`, `resync`) with a BroadcastChannel leader tab | WebSocket; polling | Data flows one way. Browsers allow 6 HTTP/1.1 connections per origin, which multiple tabs would exhaust. |
| Rust sends typed JSON plus markdown fragments; the client renders prose with react-markdown | Server HTML from comrak | Lets the client map elements to components (archify card, author chip, refs). Checkboxes come from Rust anchors. |
| Archify inline fenced blocks; cache by content hash; sandboxed iframe through a URL | srcdoc; sidecar JSON files (v1.1) | User decision. The `embed` and `theme` query parameters need a URL. Stubs in `wf context` stop the JSON from bloating agent context. |
| React 19 + TanStack + shadcn + pragmatic-dnd | Svelte 5; Solid | Ecosystem fit, and agents build and maintain it more reliably. Bundle size does not matter on localhost. |
| Server-side BM25 search shared by the CLI and the UI | MiniSearch in the client; tantivy | One ranking for agents and humans. tantivy is not needed below about 50k documents. |
| Drawer tabs `Now · Goal · Plan · Log · Files`; Now comes first | One long scrolling page | The user wants single-page with minimal scroll and current_state first. |
| Hand-crafted Linear-like tokens, color only for meaning | Default shadcn theme | The user chose "Calm & precise". |
| `authors.md`, not `agents.md` | agents.md; authors.yaml | APFS is case-insensitive, so agents.md and AGENTS.md would be the same file. Markdown keeps the "files only" principle. |
| Issues are leaves; split an issue by converting it into a group | Nested issues | Removes ambiguity about where roll-ups and leases apply. Groups already nest. |
| Lease truth lives in plan.md and goal.md; heartbeat rewrites only below 50% of the lease | A runtime file in `.wf/` | Files stay the truth. Heartbeats cause about 1 write per 30 minutes. |
| The library has a review gate: only `reviewed` items are injected | Auto-promotion | v1 injects library items into sessions automatically, and one bad item would spread everywhere (memory poisoning). |
| Skill logic lives in `wf` subcommands; skills are thin and portable | Logic in hook scripts | Hooks do not port to Codex or Cursor. The CLI does. |
| Writer skills named `write-*` and `log-*` (verb-object) | Gerund names | They match the user's own wording ("a skill to write goal.md"). |
| Many small crates (8) | 3–4 crates | Disjoint ownership lets 8+ agents work at once without conflicts. |

---

## Part 3: Notable ideas per section (section writers must include these)

**§1 Vision.** Open with: "An issue is just a folder of markdown files." State the three file lifecycles (stable, revised and overwritten, append-only). Non-goals:
- no DB
- no LLM calls in `wf`
- no auto-commit
- no two-way sync with Jira or Linear
- no burndown or leaderboards
- no real-time co-editing
- no multi-workspace in v1

Use the 1.14 scope list verbatim.

**§2 Glossary.** Use the seed terms of 1.4. Add: lease, coordinator, ready task, needs-you request, wf_format, anchor, rev. One term, one meaning. Note the avoid lists: "ticket, card, story" → issue; "publish, upstream" → promote.

**§3 Repo layout:**

```
Cargo.toml  rust-toolchain.toml  justfile  .gitattributes  .gitignore  README.md  AGENTS.md  CLAUDE.md(@AGENTS.md)  THIRD_PARTY_NOTICES.md  LICENSE
.claude-plugin/marketplace.json  .github/workflows/ci.yml
spec/{format.md, lint-rules.md, api.md, interfaces.md, archify-blocks.md, design-tokens.md}
crates/{wf-model, wf-parse, wf-lint, wf-edit, wf-archify, wf-index, wf-server, wf-cli}/
web/{index.html, package.json, vite.config.ts, biome.json, mock/, src/{main.tsx, app/, lib/{api,live,markdown}/, components/{ui,common}/, features/{board,issue,diagram,library,inbox}/, gen/, styles/{tokens.css,base.css}}}
templates/{goal.md.j2, plan.md.j2, current_state.md.j2, _group.md.j2, library-<kind>.md.j2, workflow.toml.j2}
plugins/{workflow, library, agent-execution}/{.claude-plugin/plugin.json, skills/<name>/{SKILL.md, references/}, hooks/, scripts/}
fixtures/{golden/ (workspace), expected/ (insta JSON), api/ (mock responses), archify/ (valid+invalid per type)}
tests/conformance/   e2e/   docs/{plan/, skills-flowchart/, user/}
workspace/  (dogfood: workflow.toml, glossary.md, authors.md, issues/wf/{core,web,skills}/…, issues/wf/build-v1/ (the issue tracking this build, with a lanes plan.md), library/)
```

**§4 File format.**
- Give a full realistic example per file, consistent across files: the dogfood issue `wf-3k9x2` "Live board updates". Use T-1…T-5 across lanes `core`, `server`, `web`; authors @claude-opus, @codex, @shruti.
- Include one archify `workflow` block in plan.md and one `architecture` block in goal.md.
- Tolerance table:
  - a missing file shows an empty state plus a skill hint
  - bad YAML renders the body as plain markdown, with F001 shown at the YAML error position
  - an unparseable entry heading becomes an "untitled block" inside the previous entry, with F005
  - unknown keys are shown
- Reproduce the 1.7 lint table with messages.

**Lint rules (canonical; referenced as 1.7).**

Lint never blocks display. `wf lint` exits 1 on any error and 0 otherwise (`--strict` also fails on warnings). A finding is `{rule, severity, file, line, col, span, message, fix?}`. Inline disable: `<!-- wf-lint-disable S06 -->`.

- **F (format, from wf-parse):**
  - F001 invalid YAML (error)
  - F002 required field missing (error)
  - F003 bad enum value (error)
  - F004 duplicate ID (error)
  - F005 malformed entry or task heading (warn)
  - F006 unknown key (info)
  - F007 wf_format mismatch (warn)
  - F008 issue folder that also has `_group.md` (error)
  - F009 dangling reference (warn)
  - F010 archify block has an unknown type or invalid JSON (error)
  - F011 archify render failed (error)
  - F012 git conflict markers (error)
  - F013 unknown dependency, or a dependency cycle (error)
  - F014 overlapping `owns` inside one plan (warn)
  - F016 entry without an author (error)
  - F017 meta list after a blank line (warn)
  - F018 unknown step or key under `[flow]` in workflow.toml; wf keeps it and ignores it (warn)
  - F019 a `[flow]` value the flow cannot use: an option value it does not take, a custom step with a bad id, `after` or no skill, a skill that is not a reference, a step that names the built-in skill of another step (warn)
  - F020 a `[flow]` reference to a built-in or `ws:` skill that does not exist; the step runs its built-in skill (warn). References into a library are checked by the dashboard and `wf-env.sh flow`
  - F021 a skill of the workspace's `skills/<name>/SKILL.md` that breaks the rules of `check-skills.mjs` (warn)
  - F015 log entry body changed versus git HEAD (warn, v1.1)
- **Q (workflow, from wf-index):**
  - Q001 done but criteria not met
  - Q002 in_progress without a plan (skipped for xs/s)
  - Q003 stale
  - Q004 lease expired
  - Q005 current_state older than the latest change
  - Q006 criterion not covered by any task's `satisfies` (info)
  - Q007 task satisfies nothing (info)
  - Q008 current_state over 400 words, or no Next steps
  - Q009 two live decisions share a topic
  - Q010 criterion ticked without evidence (info)
  - Q011 secret detected (error)
  - Q012 author not in authors.md
  - Q013 library item past `review_after` (info)
  - Q014 plan.md over 200 lines, or a phase with more than 10 tasks (info)
  - Q015 illegal status transition seen in git history (warn, v1.1)

  Q rules are warnings unless marked otherwise.
- **S (writing standard, from wf-lint; all warn or info):**
  - S01 sentence too long: over 20 words in steps, over 25 elsewhere (warn)
  - S02 paragraph over 6 sentences (info)
  - S03 passive voice (info)
  - S04 more than one instruction in a step (warn)
  - S05 step does not start with an imperative verb (warn)
  - S06 hedge word (warn)
  - S07 claim that cannot be measured, in a criterion (warn)
  - S08 criterion not in an EARS pattern (info)
  - S09 glossary synonym (warn, with a fix)
  - S10 undefined acronym (info)
  - S11 entry starts with "It" or "This", or uses a contraction (warn)
  - S12 warning notice after its step (info)
  - S13 date-only timestamp (info)

**§5 Rust.**
- Pipeline: watch, then debounce (250 ms), then nearest existing ancestor, then rescan the subtree, then a blake3 diff, then parse the changed files, then rebuild affected roll-ups and signals, then swap the snapshot, then broadcast `delta`.
- Register the watch before the first scan. `canonicalize` the root.
- Archify process model:
  - temp dir with `candidate.json` (overriding `meta.output`)
  - `node <home>/bin/archify.mjs finalize <type> candidate.json out.html --quality <q> --json`
  - a non-zero exit means `invalid`, with errors parsed from the JSON receipt
  - a missing node or archify means `unavailable`; the UI shows the JSON source and the hint `wf doctor`
  - cache `.wf/cache/archify/<hash>.html` plus `<hash>.json`
  - a bridge script of about 20 lines: a ResizeObserver posts `wf:size`, and the page listens for `wf:theme`
- Write-back: the protocol of 1.10, plus a property test that bytes outside the span never change. `wf append` uses the same lock.
- Spell out the structs named in 1.10.

**§6 Frontend and UI.**
- **Viewport:** `100dvh`, `overflow: hidden`. The grid is `[NavRail | Main | Drawer]`. Main has a 44 px toolbar. Only inner regions scroll.
- **Drawer docking:** the drawer docks beside the board at ≥1600 px and overlays it as a sheet below that. Below 768 px there is a single column, and an issue opens as the full page.
- **Board:** 6 columns (Cancelled is hidden behind the `show` filter). Backlog and Done fold to a 36 px rail. Columns scroll horizontally inside the board. Virtualize a column above 40 cards.
- **Nested groups:** the GroupTree in the nav selects a subtree, with a roll-up count and a mini bar per node. Swimlanes show the direct child groups (`swim=child|none`). Drops across swimlanes are disabled.
- **Card anatomy:** title (2-line clamp), relative group path (faint) and a 14 px ProgressRing. Then signal chips, only when present: needs-you (accent), blocked, stale (amber), lease holder AuthorStack, lint dot. On hover: tasks "3/8 · 2 ready" and the last-activity time. Every element gets one "why it earns its place" line.
- **Drag:** optimistic. A 409 rolls back with the toast "goal.md changed by @codex — reapply?". The done gate opens a dialog that lists the gaps.
- **Element components:**
  - **StateSnapshot (Now tab):** the summary line, updated-by and updated-at with a staleness tint, NeedsYouList with an inline answer box, In flight with task pills, Blocked (red hairline), Next steps (item 1 emphasized). Done, Handoff notes and Failed attempts are collapsed.
  - **CriteriaChecklist + ProgressRing:** solid means verified and hatched means claimed. EARS keywords appear in faint small caps. Shows verify and evidence chips. CoverageStrip shows the tasks per SC.
  - **PlanLanes:** rows are lanes and columns are dependency levels. TaskPill shows ID, status glyph and claimant. Edges are drawn only on hover or selection. A "Ready" highlight. Toggle to PlanList (phase stepper; finished phases collapse).
  - **ChangesTimeline:** grouped by day with sticky headers. Author-hue dots with an agent or human glyph. Kind glyphs; failure entries are red. Filter chips by author and kind.
  - **DecisionCards:** ADR cards with the decision first. Rejected options are collapsed. Superseded chains are folded.
  - **LearningCards:** a kind icon, the rule in bold, and Promote, or "In library ↗" once promoted.
  - **ArchifyCard:** `clamp(220px, 32vh, 420px)`, lazy loaded through IntersectionObserver. Click opens DiagramDialog fullscreen (no embed, `allow-downloads`). An invalid diagram shows the error list, the JSON and "copy for agent".
  - **DocsList/DocView:** extra files and assets.
  - **LintPanel:** findings grouped by file, with line jump.
- **Live updates:** a 150 ms background fade on changed cards. Activity toasts appear only for needs-you, blocked and expired-lease events. The tab title shows a count like "(3)".
- **Keyboard:** ⌘K palette; ⌘B or `[` nav; `g w` / `g l` / `g i`; `j/k` cards; `h/l` columns; Enter drawer; `o` full page; `s` status menu; `n` new issue; `/` filter; `Esc` close; `?` help.
- **Theme:** a pre-paint script sets `data-theme`, and the same value goes to the iframes. Build the hue palette with the dataviz validator, and check contrast in both themes.

**§7 Library.**
- **Promotion:** UI Promote, `wf promote` or the skill `promote-to-library` creates a `draft` item with a `source:` backlink and a needs-you review request to the group owner. Approval sets `reviewed`.
- **Dedupe:** on promote, a BM25 title and body similarity above a threshold suggests "merge into lib-…" (v1 suggests only).
- **Retrieval:** `search-library` runs before `write-goal` and `write-plan`. It reads only the top 1–2 hits, and records them in `current_state.library_refs` and in plan `## Prior art`.
- **Context:** only `reviewed` items enter `wf context`. They are wrapped as reference data, never as instructions.
- **Backlinks:** a backlinks panel, "used by N issues", and `review_after` staleness. The Glossary appears as a tab of the Library view.

**§8 Skills.**
- For each skill: name, a description of the form "Use when …; avoid …" (≤1024 chars), steps, and the `wf` commands it uses.
- `write-plan` must:
  1. consult the library
  2. list assumptions
  3. decompose into tasks of one context window each, with `depends_on`, a `lane`, disjoint `owns`, `satisfies` and `verify`
  4. maximize the width of the ready set
  5. lint
- `using-workflow` is the router.
- **Flowchart** (archify `workflow` diagram, `docs/skills-flowchart/`):
  - Start: SessionStart hook, then `resume-issue`
  - Decision "issue exists?": no leads to `search-library` → `write-goal`; yes leads to "plan exists?"
  - "Plan exists?": no leads to `write-plan`, then `split-issue` if there are more than 10 tasks or several deliverables
  - Execution: `claim-task` → `execution-guidelines` + `test-first` → execute → `log-change` / `log-decision` → (stuck? `debug-systematically`, and after 3 failures `ask-human`) → `verify-before-done` → `write-current-state`
  - "All tasks done?": `review-work` (fresh context) → `close-issue` → `log-learning` → `promote-to-library` → `curate-library` (periodic)
  - A parallel branch: `dispatch-subagents` for wide ready sets
  - Cross-cutting: `keep-context-lean`

**§9 Operating loop.**
- Narrate @claude-opus as coordinator, plus @codex and a second Claude instance as workers.
- Show:
  - `wf next --claim` races resolved by the lock
  - heartbeat
  - a lease expiring on a dead worker (amber), then `--steal`
  - a blocking question answered by @shruti in the UI, then `wf resolve`
  - a handoff via `wf context` in a fresh session
  - the review by a fresh-context agent
  - the done gate
  - promotion
- Shared checkout: code worktrees find the workspace through `WF_ROOT`.

**§10 Writing standard.**
- "wf Plain English (based on STE)". Never claim "STE-compliant". Do not copy the ASD dictionary.
- Use rules R1–R14 in our own words, with good and bad examples for each file.
- Show the EARS parser of 1.5.
- Lint mapping: S01–S13. List what stays skill guidance only: noun clusters, tense, pronouns, INVEST, real alternatives, promotion-worthiness.
- Show how the writer skills enforce it: template, examples, self-check loop.

**§11 Best practices table.**
- Practice → source URL (from bp-*.md) → where adopted (field, skill, hook, CLI, lint or UI) → v1 or later. Cover Anthropic (LH, CE, HD, BP, WT, SK, EV), Cognition, Cursor, Manus, 12-factor, Chroma, Factory, HumanLayer, prior art (copy, adapt, avoid), and skill packs.
- **Credits:** Karpathy guidelines (forrestchang, MIT), superpowers (MIT), compound-engineering (MIT), mattpocock (MIT), planning-with-files (MIT), anthropics skill-creator and HumanLayer (Apache-2.0). Never copy anthropics docx, pdf, pptx or xlsx. Record these in THIRD_PARTY_NOTICES and in `metadata.source`.
- **Conflicts and resolutions:**
  - inline archify JSON → stubs in context, sidecar in v1.1
  - self-ticked progress → verified vs claimed
  - concurrent writers → coordinator plus task leases
  - a plan for every issue → size xs/s
  - wide v1 scope → milestone order
  - library poisoning → review gate
  - markdown checkboxes overwritten by agents → stable IDs, plus goalpost detection in v1.1

**§12 Features.** Rank the 25 items from ideate-features.md with effort and recommendation. Mark as folded into v1: #1 merge-safe writes, #2 verifiable criteria, #3 hooks, #4 `wf next`, #5 the claim-time owns guard, #6 stable IDs, #7 review gate and secrets, #8 supersession, #9 `satisfies`, #10 wf_format, #11 the roster (`authors.md`), #12 the context budget, #13 browser notifications. Add the user's v1 picks as "included".

**§13 Task graph.** Use these IDs exactly. Owners have disjoint paths. The "C" lines are checkpoints.

| id | title | wave | depends_on | owns |
|---|---|---|---|---|
| T01 | Repo scaffold + CI + dep pins | 0 | — | root files, `.github/**`, `crates/*/Cargo.toml` + stub `lib.rs` (handed to crate owners at C0), `web/{package.json,vite.config.ts,tsconfig.json,biome.json,index.html}` |
| T02 | Format spec + lint table + golden workspace | 0 | — | `spec/format.md`, `spec/lint-rules.md`, `fixtures/golden/**` |
| T03 | Model + API/SSE schema + interfaces + TS types | 0 | — | `crates/wf-model/**`, `spec/api.md`, `spec/interfaces.md`, `web/src/gen/**` |
| T04 | Design tokens | 0 | — | `spec/design-tokens.md`, `web/src/styles/**` |
| T05 | Archify block contract + fixtures | 0 | — | `spec/archify-blocks.md`, `fixtures/archify/**` |
| C0 | Contracts frozen | — | T01–T05 | — |
| T10 | wf-parse | 1 | C0 | `crates/wf-parse/**`, `fixtures/expected/**` |
| T11 | wf-lint (S rules, glossary, secrets) | 1 | C0 | `crates/wf-lint/**` |
| T12 | wf-edit (locks, ops, append, scaffold) | 1 | C0 | `crates/wf-edit/**` |
| T13 | wf-archify | 1 | C0 | `crates/wf-archify/**` |
| T14 | wf-index core (scan, watch, snapshot, delta, roll-ups, signals, ready, Q rules) | 1 | C0 | `crates/wf-index/{Cargo.toml,src/{lib,scan,watch,snapshot,delta,rollup,signals,ready,rules}.rs}` |
| T15 | Search + context bundle | 1 | C0 | `crates/wf-index/src/{search,context}.rs` |
| T16 | wf-server (routes, SSE, ops, embed) | 1 | C0 | `crates/wf-server/**` |
| T17 | wf-cli command table + commands | 1 | C0 | `crates/wf-cli/**` except `src/cmd/hook.rs` |
| T18 | Web shell + data layer + live client + palette | 1 | C0 | `web/src/{main.tsx,app/**,lib/**,components/**}` |
| T19 | Board | 1 | C0 | `web/src/features/board/**` |
| T20 | Issue view (drawer, page, all element components) | 1 | C0 | `web/src/features/issue/**` |
| T21 | Archify card + dialog | 1 | C0 | `web/src/features/diagram/**` |
| T22 | Library + inbox views | 1 | C0 | `web/src/features/{library,inbox}/**` |
| T23 | API fixtures + mock server | 1 | C0 | `fixtures/api/**`, `web/mock/**` |
| T24 | Templates | 1 | C0 | `templates/**` |
| T25 | Workflow plugin skills | 1 | C0 | `plugins/workflow/{.claude-plugin,skills}/**` |
| T26 | Library plugin | 1 | C0 | `plugins/library/**` |
| T27 | Agent-execution plugin + notices | 1 | C0 | `plugins/agent-execution/**`, `THIRD_PARTY_NOTICES.md` |
| T28 | Marketplace + skills flowchart | 1 | C0 | `.claude-plugin/**`, `docs/skills-flowchart/**` |
| C1 | Crates compile together; web works on mocks | — | T10–T28 | — |
| T30 | Hooks pack | 2 | C1 | `plugins/workflow/{hooks,scripts}/**`, `crates/wf-cli/src/cmd/hook.rs` |
| T31 | Conformance harness | 2 | C1 | `tests/conformance/**` |
| T32 | Dogfood workspace | 2 | C1 | `workspace/**` |
| T33 | Playwright e2e on the real binary | 2 | C1 | `e2e/**` |
| C2 | v1 release candidate | — | T30–T33 | — |
| T34 | Release + user docs | 3 | C2 | `README.md`, `docs/user/**`, `dist` config |

- Max concurrency: 5 in wave 0, 19 in wave 1, 4 in wave 2.
- Critical path: T03 → T10 → T14 → T16 → T33 → T34.
- Wave 1 lanes code against `spec/interfaces.md` stubs and `fixtures/`. A lane may only add dependencies to its own crate's Cargo.toml. T15 adds no crates (own BM25); any dependency it needs goes through T14.
- T01 pins every npm package of 1.11 in `web/package.json` up front. At C0, ownership of `web/package.json`, `vite.config.ts` and `index.html` moves to T18. Other web lanes request new packages through T18.
- Write the brief template and three full briefs: T10, T19 and T25.

**§14 Milestones:**
- M0 = C0 (contracts and golden fixtures)
- M1 = the web on mocks (`pnpm dev:mock`)
- M2 = `wf new/append/lint/state` working on the golden workspace
- M3 = `wf serve` read-only and live
- M4 = write-backs, claims, `wf next` and the inbox
- M5 = skills, hooks and conformance green
- M6 = library and diagrams
- M7 = dogfood v1 (C2)

Each milestone gets a demo command and acceptance checks taken from the SC-style criteria.

**§15 Testing:**
- insta golden snapshots of `fixtures/golden`
- a splice property test (proptest)
- concurrent `wf append` stress test: 8 processes × 50 appends give 400 entries and no losses
- conflict (409) tests
- watcher integration: atomic save, `mv` of a folder, `rm -rf`
- API contract tests: Rust JSON validated against the ts-rs types (`fixtures/api` must deserialize)
- SSE resync
- archify: valid, invalid and unavailable
- conformance of every `wf-example` block
- `claude plugin validate --strict`
- skill trigger evals (`claude plugin eval`)
- Playwright: drag, drawer, deep link, answer, promote, and dark mode screenshots

**§16 Risks:**
- notify on macOS (mitigation: rescan design)
- agents bypassing `wf append` (mitigation: hash check, merge=union, `wf doctor`)
- self-reported progress (mitigation: evidence)
- library poisoning (mitigation: review gate)
- context bloat (mitigation: budget and stubs)
- new-major dependencies (serde-saphyr 2, minijinja 3, TS 7)
- archify iframe weight (~760 KB each; mitigation: lazy load)
- 6-connection SSE cap (mitigation: leader tab)
- skill undertriggering (mitigation: pushy descriptions and hooks)
- scope creep in v1 (mitigation: milestone order)

**§17 Assumptions to confirm:**
- the user defaults: runtime, frontmatter, status, distribution, dashboard actions and CLI
- port 7777
- notify 8.2 (not the 9 RC)
- serde-saphyr 2.0, minijinja 3, TS 7 + Biome
- current_state as the 6th file with the section order in 1.5
- the `authors.md` name
- the ID formats and the entry heading grammar
- issues are leaves
- a single coordinator per issue
- 60-minute leases; staleness at 24 h and 4 h
- 20/25-word limits; all style lints are warnings; `must` is accepted as `shall`
- the review gate for the library
- the UI acts as `[server] author`
- the bundled Inter font
- `issues/` as issues_dir
- merge=union
- `wf verify` runs shell commands from the CLI only
- the drawer docks at ≥1600 px
- no auto-commit
- archify home defaults to `~/.claude/skills/archify` with `--quality showcase`
