# Features you have not mentioned yet: ranked

Effort: **S** is about 1 agent-day or less. **M** is 2 to 4 agent-days. **L** is 1 week or more.
Already in v1: task claiming and leases with staleness, the "needs you" inbox, the handoff bundle with a SessionStart hook, writer skills, `wf lint`, and library promotion. The MCP server is deferred to v1.1.

---

### 1. Merge-safe concurrent writes (S–M, **v1, wave 0 contract**)
- **Problem:** Say 8 or more agents work in separate git worktrees. Each one appends to the end of the same `changes.md`, so every merge conflicts. Two agents can also overwrite `current_state.md`, and one snapshot is lost without anyone noticing. This is the first thing that breaks once you parallelize.
- **In the files:**
  - The workspace is one shared checkout. All code worktrees resolve to it through `workflow.toml` or `WF_ROOT`. Agents write hot fields only through `wf`, which takes a file lock and writes to a temp file, then renames it.
  - Fallback: a `.gitattributes` line, `changes.md decisions.md learnings.md merge=union`. Entries are self-contained blocks, and the UI sorts them by `at:` instead of file order.
  - `current_state.md` has one writer at a time: the issue's `coordinator:` lease. Workers update their own task through `wf task set` and append to `changes.md`.
  - `wf doctor` finds conflict markers, duplicate IDs and orphaned leases.
- **Why v1:** This is part of the format contract. Adding it after teams have written files means a migration.

### 2. Success criteria you can verify (M, **v1**)
- **Problem:** Agents tick a criterion without proof ("tests pass" when they do not). A human cannot tell a claimed criterion from a verified one, so the progress ring only measures what agents report about themselves.
- **In the files:**
  - A criterion in `goal.md` gets an optional `verify:` field: a shell command, or `manual`. `goal.md` stays stable.
  - `wf verify <issue>` runs the checks. It appends `type: verify` entries to `changes.md` with a result, the criterion ID (for example `SC-2`) and `evidence:`. Evidence can be a commit SHA, a PR, or a file under `evidence/` in the issue folder.
  - The UI works out each criterion's state: open, claimed, verified or failed. The ring shows verified as solid and claimed as hatched.
  - Drift flag: an issue is `done` while some criteria are only claimed.
- **Why v1:** This makes the Karpathy-style rule "goal-driven, with verifiable criteria" actually enforced.

### 3. Lifecycle hooks pack beyond SessionStart (S, **v1**)
- **Problem:** Leases, staleness and handoff all depend on agents remembering to do things. Agents forget to renew leases or update `current_state.md` before a session ends or the context is compacted. You get false "dead agent" alarms and lost context.
- **In the files:**
  - **PostToolUse**, throttled: `wf heartbeat` renews the lease. The raw heartbeat goes to gitignored `.wf/runtime/`. The lease expiry in `plan.md` is rewritten only when it is close to expiring, which limits git churn.
  - **Stop and PreCompact:** if the agent holds a claim and has not updated `current_state.md` in this session, block once and ask it to update the snapshot and append a change. Respect `stop_hook_active` so it cannot loop.
  - **SessionEnd:** release or keep the lease, depending on config.
  - Ships as `hooks/hooks.json` in the workflow plugin, with documented equivalents for Codex and Cursor.
- **Why v1:** Without it, the v1 lease and handoff features cannot be trusted.

### 4. Ready queue and `wf next` (S, **v1**)
- **Problem:** With a task graph of 30 tasks, a human assigns each one by hand. Agents pick blocked tasks or collide.
- **In the files:** The queue is worked out from the `plan.md` task fields (`status`, `depends_on`, `lane`, `owns`, `claimed_by`, lease) across all issues.
  - `wf next [--issue X] [--lane Y] --claim` returns the highest-priority ready task and claims it atomically under the lock.
  - A task is ready when its dependencies are done, it has no live lease, and its owned paths do not overlap any live lease.
  - The plan graph highlights ready nodes, and each card shows "Ready N".
- **Why v1:** It is a small function on top of the graph parser, and it is what lets agents take work without a human handing it out.

### 5. Owned-path overlap guard and scope check (S, **v1 claim-time; v1.1 diff check**)
- **Problem:** The plan declares disjoint ownership, but nothing enforces it. Agents also edit files outside their task, which breaks the "surgical changes" rule.
- **In the files:**
  - Task `owns:` globs in `plan.md`.
  - `wf claim` refuses when its globs overlap another live lease (prefix match is enough). Lint warns about overlapping `owns` inside one plan.
  - v1.1: `wf scope-check T-3` compares `git diff --name-only` with `owns:` and shows an amber "out of scope" chip. An optional PreToolUse hook warns when Edit or Write touches a path outside `owns`.
- **Why v1:** Disjoint ownership is the whole parallel strategy, so it must be checked.

### 6. Stable IDs and cross-references (S, **v1, wave 0 contract**)
- **Problem:** Folders get moved, renamed or archived. Links from library provenance, `depends_on` and evidence then break. There is also no way to cite one decision from another issue.
- **In the files:**
  - An immutable `id:` in the `goal.md` and `_group.md` frontmatter.
  - Entry IDs that cannot collide across branches: a short base32 hash of time and author, such as `D-7f3k`. Sequential IDs like `D-7` collide across worktrees.
  - `SC-n` for criteria and `T-n` for tasks. These can be sequential because one writer owns each file.
  - Reference syntax `[[ISSUE-ID#D-7f3k]]`, shown with a hover preview and a backlinks panel. Lint flags dangling refs.
  - Stable IDs are also what make `wf archive` (move to `_archive/<year>/`, v1.1) safe.
- **Why v1:** IDs are the base that items 2, 8, 9, 14 and 17 build on.

### 7. Library review gate and secret check (S, **v1**)
- **Problem:** The SessionStart hook injects library items into every session. One wrong, hallucinated or hostile entry then spreads to all future agents. Separately, agents paste command output that contains tokens into `changes.md`, and it stays in the shared git history for good.
- **In the files:**
  - Library frontmatter `status: draft|reviewed|retired` and `reviewed_by:`. Only `reviewed` items go into `wf context` and the hook.
  - "Promote to library" creates a `draft` item and opens a needs-you review request.
  - `wf lint` has secret patterns (cloud keys, GitHub tokens, private keys, `.env`-style lines). An optional pre-commit hook runs `wf lint --secrets --staged`.
  - The bundle wraps library text as reference data, not as instructions.
- **Why v1:** Auto-injection ships in v1, so the trust gate has to ship with it.

### 8. Decision supersession (S, **v1**)
- **Problem:** Agents act on decisions that were later reversed. In an append-only log, the old decision looks just as valid as the new one.
- **In the files:** Decision entries get `supersedes: D-xxxx` and an optional `topic:`. The UI folds superseded decisions into a chain, and the bundle includes only live decisions. Lint warns when two live decisions share a topic. This works inside append-only: a new entry supersedes an old one, and nothing is edited.
- **Why v1:** It is one field in the contract.

### 9. Criteria-to-task traceability (S, **v1**)
- **Problem:** Plans drift away from goals. A task that serves no criterion is scope creep. A criterion that no task covers is a gap nobody finds until the end.
- **In the files:** A `satisfies: [SC-2]` field on `plan.md` tasks. A coverage strip under the criteria checklist shows each criterion with its tasks and their status. Lint warns about uncovered criteria and unlinked tasks. The write-plan skill fills in the field.
- **Why v1:** It is one field, and it connects the goal to the plan graph.

### 10. Format versioning and migration (S now, L if skipped, **v1, wave 0**)
- **Problem:** Skills go out to teams and get updated at different times. A team on old skills writes the old format, and the new parser misreads it without warning.
- **In the files:** `wf_format: 1` in `workflow.toml` and in the contract section of each SKILL.md. `wf lint` reports version mismatches between files, skills and the parser. `wf migrate --to N --dry-run` rewrites files surgically. Each format version has its own golden conformance fixtures.

### 11. Agent roster (S, **v1**)
- **Problem:** Author tags are free text, so typos split the stats (`@claude-opus` vs `@claude-opus-4`). Colors differ between views. You also cannot route by role or cap how many tasks an agent holds.
- **In the files:** `agents.md` at the workspace root, with id, kind (claude-code, codex, cursor or human), model, color token, lanes and `max_leases`. Lint warns about unknown `@author` tags. All author colors come from this file, and `wf next --as @codex` reads its lanes.

### 12. Context budget and log rollover (S + S, **v1 budget; v1.1 rollover**)
- **Problem:** The handoff bundle grows as the issue grows and fills the context window. The append-only logs also grow without limit.
- **In the files:**
  - `wf context --budget 6000` estimates tokens and ranks content in this order: current_state, open tasks, unverified criteria, last N changes, live decisions, library. It cuts with pointers such as "+12 older: `wf show …`".
  - Lint warns when `current_state.md` is over about 400 words or has no next steps.
  - v1.1: `wf rollover` moves old entries to `history/changes-2026Q3.md` and appends a summary entry.

### 13. Inbox notifications (S, **v1 browser; v1.1 webhook**)
- **Problem:** The v1 inbox only helps when someone is looking at it. Agents stay blocked for hours on a 5-second question.
- **In the files:** Needs-you items get `urgency: blocking|fyi`. Server-sent events drive browser notifications, a tab title count like "(3)", and a favicon dot. Only blocking items, expired leases and newly blocked issues notify. A `[notify]` section in `workflow.toml` adds an optional Slack or ntfy webhook in v1.1.

### 14. Goalpost-move detection (M, **v1.1**)
- **Problem:** A known agent failure is weakening the criteria (or the tests) so the work looks finished.
- **In the files:** On the status change to `in_progress`, `wf` writes `criteria_baseline: <sha>` into the `goal.md` frontmatter. Lint warns when criteria differ from the baseline and no decision entry lists `affects: [SC-n]`. The UI shows a "criteria changed" chip with an inline diff.
- **Why v1.1:** It needs git diff plumbing. A lint-only version could ship in v1.

### 15. Git and PR linkage (M, **v1.1**)
- **Problem:** `changes.md` either repeats what git already knows or contradicts it. Humans want the real diff, PR and CI result for each task.
- **In the files:**
  - Commit trailers `Wf-Issue: <id>` and `Wf-Task: T-3`, added by the execution skill or a commit hook. The server reads the git log of the repos listed in `workflow.toml` and shows commits in the task row and the timeline. These are derived, never written back into the files.
  - Task fields `branch:` and `pr:`. PR and CI status come from `gh`.
  - `wf claim --worktree` creates a worktree on branch `wf/<task-id>`.

### 16. MCP server, `wf mcp` (M, **v1.1, deferred by you**)
- Gives agents without hooks (Cursor, IDE Codex) the same verbs: context, next/claim/heartbeat, append, ask, search_library, lint.
- Build the CLI and the MCP server from one command table so they cannot drift apart.

### 17. Library lifecycle and auto-suggest (M, **v1.1**)
- **Problem:** The library decays: duplicates, contradictions, outdated gotchas, and no signal about which items help.
- **In the files:**
  - On promote, a similarity check suggests merging with an existing item.
  - Frontmatter `source: [[ID#L-x]]`, `review_after:`, `superseded_by:` and `applies_to:`.
  - Usage is the count of `library_refs:` that agents record in `current_state.md`, shown as "used by 7 issues" or "unused 90d".
  - A new `goal.md` shows the top-k suggested items in the drawer and in the write-goal skill.

### 18. "Since you last looked" and snapshot history (S + M, **v1.1**)
- **Problem:** A human supervising 8 agents re-reads everything. Because `current_state.md` is overwritten, yesterday's blockers disappear from view.
- **In the files:** Last-seen times are stored per viewer (browser storage or gitignored `.wf/local/`). Cards and timeline entries get "new" markers, and the `n` key jumps to the next unseen item. A history slider for current_state, goal and plan reads `git log --follow -p`.

### 19. Pause and stop signal (S, **v1.1**)
- **Problem:** A runaway fleet (wrong plan, cost spike) needs a one-click stop. Killing terminals loses context.
- **In the files:** `paused: true` in `goal.md`, `_group.md` or `workflow.toml [control]`, set by a UI button. A PreToolUse hook blocks tool calls and tells the agent to write `current_state.md` and release its leases. Staleness alerts are off while paused.

### 20. Dependencies between issues (S, **v1.1**)
- **In the files:** `blocked_by: [ISSUE-ID]` in the `goal.md` frontmatter, shown as a card badge. When the blocker is done, an fyi item goes to the inbox and the issue appears in the ready queue. Lint flags cycles. Group rollups show the critical path across issues.

### 21. Readiness and done gates (S, **v1.1**)
- **Problem:** Issues start without measurable criteria. They close without verification, a final snapshot, or a review of their learnings.
- **In the files:** These are bundles of lint rules shown when you drag a card.
  - Into `in_progress` (ready check): criteria in EARS form, at least one task, disjoint `owns`, full `satisfies` coverage.
  - Into `done` (done check): criteria verified, no live leases, no open asks, final handoff, learnings reviewed.
  - They list the specific gaps instead of a numeric score, and are configurable per template kind.

### 22. Cost and session ledger (M, **v1.1**)
- **Problem:** You cannot see which issue or agent uses the tokens, so you cannot compare agents or set budgets.
- **In the files:** A Stop or SessionEnd hook reads Claude Code transcript usage and appends a `type: session` entry: agent, model, tokens, estimated cost, duration and transcript path. Other agents report through `wf append --session`. `budget_usd:` in `goal.md` turns amber at 80%. Rollups go per issue, group and agent, labeled as estimates.

### 23. Digests and retros (S–M, **v1.1**)
- `wf digest --since 7d` writes a committed `digests/2026-W43.md`. It covers what was done, decisions, learnings waiting for promotion, stale or blocked work, open asks and cost.
- A library `retro` skill turns repeated learnings and repeated lint warnings into library items or fixes to the skills.

### 24. Read-only static export (M, **later**)
- `wf export --static out/` builds the same SPA from pre-built JSON and rendered archify HTML. `export: false` and path excludes keep sensitive content out.
- **Do now:** have the SPA read its data either from the API or from static JSON. It costs almost nothing in wave 0.

### 25. Dispatcher (L, **later**)
- `wf dispatch --max 8 --runner claude|codex` starts a headless agent (`claude -p`, `codex exec`) for each ready task in its own worktree. Each one starts with its `wf context` bundle, and PIDs are tracked in `.wf/runtime/`.
- **Later because:** it needs process supervision, carries cost risk, and means the UI would trigger code execution. Build it after `wf next`, hooks and pause have proven themselves.

---

## Top 5 to fold into v1 (none of them adds a new lane)

1. **Merge-safe writes with collision-free IDs (#1 + #6).** Goes into the wave 0 format spec lane and the core data model. Every other lane depends on it, so it has to be in the contract.
2. **Verifiable criteria with evidence (#2).** `verify:` goes in the wave 0 spec. The parser, goal UI and CLI lanes each take a small slice.
3. **Lifecycle hooks pack (#3).** Joins the lane that already builds the SessionStart hook, and makes the v1 leases and handoff reliable.
4. **`wf next` ready queue with the owned-path guard (#4 + #5).** Belongs to the CLI and claims lane and reuses the task-graph parser. This is the feature that makes "parallelize as much as possible" work at runtime.
5. **Library review gate and secret check (#7).** Split between the library lane and the lint lane. It is required because v1 already injects the library into sessions automatically.

**Fields to add to the wave 0 contract now (almost free now, costly later):** `wf_format`, `id:` on issues and groups, `satisfies:` on tasks, `supersedes:` on decisions, `verify:` on criteria, the `agents.md` roster, and an SPA data layer that can read the API or static JSON.

## Considered and left out
- **Two-way sync with Jira, Linear or GitHub Issues.** It breaks "files are the only source of truth." At most, a one-way import later.
- **A numeric "context health score."** Agents can game it. Specific gap checklists (#21) do the job better.
- **A chat-with-your-issue panel.** Agents already read the files, so it duplicates the CLI.
- **Burndown, velocity charts and agent leaderboards.** They are noise and do not carry a useful signal.
- **Auto-promoting learnings without review.** It fills the library with bad entries.
- **Auto-committing every UI write-back by default.** It floods the history. Make it opt-in.
- **Real-time co-editing in the UI.** A text editor plus git already covers it.
- **Multi-workspace in v1.** One workspace per team is enough. Revisit later, with the library as a separate shared repo.