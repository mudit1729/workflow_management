# Prior-art scan for `wf` (agent workspace + knowledge library)

## 1. Landscape

| System | Layout / schema | UI | Multi-agent | Praise / complaints |
|---|---|---|---|---|
| **Cline Memory Bank** | `memory-bank/`: projectbrief, productContext, activeContext, systemPatterns, techContext, progress (brief feeds the rest) | none | single agent; "update memory bank" re-reviews every file | simple, works with any agent; stays accurate only if someone keeps it updated |
| **Kiro specs** | `.kiro/specs/<feature>/requirements.md` (EARS: "WHEN … THE SYSTEM SHALL …"), design.md, tasks.md; bugfix.md variant. Steering in `.kiro/steering/*.md` with `inclusion: always/fileMatch/manual/auto`. Hooks in `.kiro/hooks/*.json` (PostFileSave, Stop, Pre/PostToolUse) | live task status; **Run all tasks** builds a dependency graph and runs waves concurrently; Markdown Review comments on passages; **Sync Files** scans code and ticks finished tasks | parallel waves | you can't switch workflow on an existing spec; spec-driven flows judged "elaborate and opinionated" (Thoughtworks) |
| **spec-kit** | `.specify/memory/constitution.md`; `specs/NNN-feature/{spec,plan,tasks}.md`; tasks written as `- [ ] T001 [P] [US1] desc + file path`, grouped in phases with **Checkpoints** | none | many agents supported, one per install (#377 asked for several) | #1191 (115 reactions): can't easily update existing specs, `specify` always makes a new branch; "sea of markdown", instruction bloat, context rot |
| **Taskmaster** | `.taskmaster/tasks/tasks.json`: id, title, description, status (pending/in-progress/done/deferred…), dependencies, priority, details, testStrategy, subtasks (`5.2`); tags for workstreams; complexity score 1–10 drives `expand` | CLI only (web-dashboard request #13) | `next` returns a task whose dependencies are met | 36 MCP tools ≈ 21k tokens (now tiered); ~370 MB per stdio process (#1641); wants its own LLM API keys |
| **Backlog.md** (closest match) | `backlog/{tasks,drafts,docs,decisions,archive,milestones}/`; files like `back-785 - Title.md`; frontmatter `id, title, status, assignee: ['@codex'], created_date, updated_date, labels, dependencies, references, modified_files, priority, type, ordinal`; body sections wrapped in `<!-- SECTION:NOTES:BEGIN/END -->`; acceptance criteria as `- [x] #1 …`; decisions as `decision-N` (status: proposed) | 127.0.0.1-only kanban with drag-drop, multi-select, checklist editor, live updates; plus a TUI | MCP plus `backlog://workflow/*` resources; checks task IDs across branches; append-only author-tagged comments; `--append-notes`; versioned `--json`; derived `readiness` (isBlocked, blockingDependencies); `onStatusChange` hook | Manifesto: markdown is the source of truth, the CLI is canonical, deterministic diffs. Complaint #160: it auto-committed silently (now off by default). Refuses to replace a section with ambiguous boundaries instead of guessing |
| **vibe-kanban** | SQLite (sqlx) as truth, not markdown | kanban (todo/inprogress/inreview/done/cancelled); worktree + setup script + dev server per attempt; diff review whose inline comments go back to the agent | 10+ agent CLIs in parallel | company shut down Apr 2026, now community-run; #2687 "Bring back old UI" (kanban lost in a redesign, tasks lost on upgrade); "please keep the Kanban board" |
| **Claude Code** | plan mode writes `~/.claude/plans/` (`plansDirectory`), Ctrl+G edits; Tasks replaced TodoWrite (v2.1.16) in `~/.claude/tasks` with dependencies | in-terminal | `CLAUDE_CODE_TASK_LIST_ID` shares one list across sessions; agent teams claim pending/in_progress/completed tasks | Tasks are not repo-visible markdown |
| **Devin** | Playbooks: Overview, Procedure, Specifications (postconditions), Advice, Forbidden Actions, Required from User; `!macro`; versioned. Knowledge = trigger description + content, retrieved on trigger match, auto-suggested from feedback, pinnable to repos; **now migrated to Skills** (trigger becomes description) | web | parallel Devins on one playbook | docs warn that stale or broad items mislead and vague triggers never fire |
| **Cursor** | `.cursor/rules/*.mdc` with `description/globs/alwaysApply`; Team > Project > User precedence; nested AGENTS.md | Agents Window in Cursor 3 (parallel local, worktree and cloud agents) | yes | advice: under 500 lines, add a rule only when the agent repeats a mistake |
| **BMAD** | story file: Status (Draft→Approved→InProgress→Review→Done), Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Change Log, Dev Agent Record (model, debug log, completion notes, File List), QA Results | none | persona agents, each owning certain sections | #496: rules both allowed and forbade the agent to edit Status; heavy process |
| **Aider** | `CONVENTIONS.md` loaded read-only (`--read`, `.aider.conf.yml`) and cached | — | — | simple and effective |
| **Beads** | hash IDs `bd-a1b2`, hierarchical `bd-a3f8.1`; blocks/related/parent-child links; Dolt storage (JSONL is export only) | CLI | `bd ready`, atomic `--claim`; `bd remember/prime`; compaction ("semantic memory decay") | Pollock: daemon, too many commands, edits AGENTS.md and installs git hooks, an upgrade broke it, forced Dolt move |
| **OpenSpec** | `openspec/specs/` is truth; `openspec/changes/<c>/{proposal,design,tasks}.md` plus deltas (`## ADDED Requirements` / `### Requirement:` SHALL / `#### Scenario:` WHEN/THEN); archive merges deltas into specs | none | 30+ agents | top issues: hierarchical specs (51), a standard `.agents/skills` folder (34), custom directory |

## 2. COPY

1. **Section markers for surgical edits** (Backlog.md). Wrap the machine-edited regions in each file (criteria, plan steps, entry lists) in `<!-- wf:criteria:begin/end -->`. If boundaries are ambiguous, refuse and show a lint error rather than guess. This directly covers the "byte-for-byte, concurrent-safe" requirement.
2. **Stable numbered checkboxes**: `- [ ] #3 text` (Backlog) and `T001 [P]` (spec-kit). The UI ticks by id, not by line number, and `[P]` drives a "parallel wave" view in the plan stepper (Kiro "Run all").
3. **Append-only, author-tagged entries** (Backlog comments, BMAD Change Log), plus `wf append` as the only CLI write path for changes/decisions/learnings.
4. **Derived readiness and claiming**: `wf next` and `wf claim` modeled on `bd ready --claim`, Taskmaster `next`, and Backlog `readiness`.
5. **Versioned `--json` on every read command**, and bind the server to 127.0.0.1 by default (both Backlog).
6. **MADR fields for decision entries** (status incl. `superseded by`, decision-makers, Considered Options, Consequences).
7. **Agent Skills `SKILL.md` + `.claude-plugin/marketplace.json`** to distribute the 3 skill plugins.
8. **Kanban as the main view, kept stable across releases** (vibe-kanban's redesign backlash).

## 3. ADAPT

- **Memory Bank → derived plus one field.** Don't ship 6 hand-kept files. Progress is computed. Add one `focus:` / next-step line in goal.md frontmatter so an agent can resume.
- **Library entries = trigger-scoped skills.** Use Devin's trigger+content, Kiro's inclusion modes and Cursor's rule types. Frontmatter: `description` (written as "Use when…"), `kind: pattern|playbook|gotcha`, `scope: always|glob|manual|auto`, `source_issue`, `owner`, `last_reviewed`. Make them SKILL.md-compatible so promoted playbooks can be installed directly. Devin itself migrated Knowledge to Skills.
- **Promotion as a reviewed delta** (OpenSpec propose→archive). "Promote" writes a draft library entry linked to its source, a human accepts it, and provenance stays visible.
- **Drift and sync** (Kiro Sync Files): the dashboard flags drift (done but criteria open, stale in_progress) but never auto-ticks.
- **Inline review comments** (Kiro Markdown Review, vibe-kanban diff comments): v2 option to comment on a passage in the drawer, appended as an author-tagged entry.
- **BMAD Dev Agent Record / Backlog `modified_files`**: change entries may carry `files:`, `model:`, `branch:`. Record worktrees; don't manage them.
- **Beads compaction**: a library-curation skill summarizes old learnings; done issues can be archived.
- **spec-kit constitution**: root `_group.md` carries workspace principles that are inherited down the group tree.
- **Stable ids**: issue folders move between groups, so put `id:` in frontmatter (short hash, Beads-style) and link by id, not path.

## 4. AVOID

| Avoid | Why |
|---|---|
| Auto-committing, editing AGENTS.md, installing git hooks unasked | Backlog #160, Beads complaints. `wf init` should print a snippet, opt-in only |
| A DB as source of truth | vibe-kanban lost tasks on upgrade; tasks.json is unfriendly to humans. Markdown is truth; the index is a rebuildable cache |
| A large MCP surface or one process per session | Taskmaster's 21k tokens and 370 MB per process. Prefer CLI + skills; if MCP is added, keep ≤7 tools served from the existing `wf serve` process |
| LLM calls or API keys inside `wf` | Taskmaster friction; the agents do the thinking |
| Doc sprawl and verbose templates | spec-kit "sea of markdown", context rot. Keep 5 files, short templates, a length lint |
| One-shot generators that can't be edited later | spec-kit #1191. Every file must be editable in small steps |
| Unclear ownership of who may edit which fields | BMAD #496. The skills state who writes `status:` |
| Stale or vague library entries | Devin pitfalls. Lint for a missing trigger or old `last_reviewed` |
| A hardcoded root directory | spec-kit/OpenSpec directory complaints. Make it configurable |
| Forced storage migrations | Beads/Dolt |

## 5. Conventions to align with

- **Status**: `backlog, planned, in_progress, blocked, review, done, cancelled`, snake_case like Beads and Claude Tasks. Map to vibe-kanban `inreview`, Taskmaster `pending/deferred`, and Backlog "To Do/In Progress/Done" for import.
- **goal.md frontmatter**: reuse Backlog keys `id, title, status, assignee: ['@handle'], labels, priority: high|medium|low, dependencies, created_date, updated_date, references, ordinal`, so a Backlog importer is nearly 1:1. The author handle format `@claude-opus` already matches.
- **Success criteria**: `- [ ] #N` checkboxes; EARS or WHEN/THEN wording is optional and lint-friendly (Kiro/OpenSpec).
- **Plan steps**: `## Phase N: …`, step ids `T001`, `[P]` for parallel, `Checkpoint:` lines (spec-kit).
- **Decisions**: MADR. **Playbooks**: Devin section names.
- **Skills**: `name` in kebab-case, ≤64 chars and equal to the directory name; `description` ≤1024 chars; body under 500 lines; plugins `workflow`, `library`, `agent-execution` in `marketplace.json`; `wf skills install` targets `.agents/skills` for other agents.
- **Agent entry point**: one line in AGENTS.md / CLAUDE.md, "run `wf instructions`" (Backlog's `backlog instructions overview` pattern).

Gaps I couldn't confirm: Kiro's official tasks.md syntax (docs page returned 404), Backlog.md's internal cross-branch mechanism, and vibe-kanban's exact status list (third-party sources only).

**Sources:** [Cline Memory Bank](https://docs.cline.bot/prompting/cline-memory-bank) · [Kiro specs](https://kiro.dev/docs/specs/) · [Kiro feature specs](https://kiro.dev/docs/specs/feature-specs/) · [Kiro best practices](https://kiro.dev/docs/specs/best-practices/) · [Kiro steering](https://kiro.dev/docs/steering/) · [Kiro hooks](https://kiro.dev/docs/hooks/) · [spec-kit](https://github.com/github/spec-kit) · [tasks template](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md) · [spec-kit #1191](https://github.com/github/spec-kit/issues/1191) · [spec-kit #377](https://github.com/github/spec-kit/issues/377) · [Thoughtworks spec-kit](https://www.thoughtworks.com/radar/languages-and-frameworks/github-spec-kit) · [CodeMySpec on Scott Logic](https://codemyspec.com/blog/github-spec-kit-guide) · [Taskmaster](https://github.com/eyaltoledano/claude-task-master) · [Taskmaster task structure](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/task-structure.md) · [Taskmaster #1641](https://github.com/eyaltoledano/claude-task-master/issues/1641) · [Backlog.md](https://github.com/MrLesk/Backlog.md) · [Backlog.md example task](https://github.com/MrLesk/Backlog.md/tree/main/backlog/tasks) · [Backlog.md CLI-INSTRUCTIONS](https://github.com/MrLesk/Backlog.md/blob/main/CLI-INSTRUCTIONS.md) · [Backlog.md MANIFESTO](https://github.com/MrLesk/Backlog.md/blob/main/MANIFESTO.md) · [Backlog.md #160](https://github.com/MrLesk/Backlog.md/issues/160) · [vibe-kanban](https://github.com/BloopAI/vibe-kanban) · [vibe-kanban shutdown](https://vibekanban.com/blog/shutdown) · [vibe-kanban #2687](https://github.com/BloopAI/vibe-kanban/issues/2687) · [vibe-kanban task monitoring](https://vibekanban.com/docs/core-features/monitoring-task-execution) · [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) · [Claude Code Tasks](https://claudelog.com/faqs/what-are-tasks-in-claude-code/) · [Claude Code agent teams](https://www.morphllm.com/claude-code-agent-teams) · [Claude plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) · [Devin playbooks](https://docs.devin.ai/product-guides/creating-playbooks) · [Devin knowledge](https://docs.devin.ai/product-guides/knowledge) · [Cursor rules](https://cursor.com/docs/context/rules) · [Cursor 3](https://www.datacamp.com/blog/cursor-3) · [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) · [BMAD #496](https://github.com/bmad-code-org/BMAD-METHOD/issues/496) · [Aider conventions](https://aider.chat/docs/usage/conventions.html) · [Beads](https://github.com/steveyegge/beads) · [Pollock on Beads](https://rufuspollock.com/2026-02-23-issue-tracking-dilemma) · [OpenSpec](https://github.com/Fission-AI/OpenSpec) · [AGENTS.md](https://agents.md) · [Agent Skills spec](https://agentskills.io/specification) · [MADR](https://adr.github.io/madr/)