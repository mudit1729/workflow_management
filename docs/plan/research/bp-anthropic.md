# Anthropic agent guidance mapped onto `workflow`, ranked by impact

Source keys and URLs are listed at the bottom. P0 means build into v1 core, P1 means v1 skills/CLI, P2 means later.

| # | Practice | Src | Concrete adoption | Pri |
|---|---|---|---|---|
| 1 | Keep state outside the context window: a short progress file the next session reads first | LH, CE, MA | Add **`current_state.md`** per issue. It gets overwritten each time, not appended, and stays ≤40 lines: where we are, next step, blockers, how to run and verify. `wf resume <issue>` runs the "get up to speed" ritual: current_state → next unchecked plan step → last 5 changes → `git log -5` → verify cmd. Lint `W-stale-state` fires when changes.md is newer than current_state. UI: **Handoff** card pinned at the top of the drawer. | P0 |
| 2 | Give the agent a pass/fail check, and ask for evidence instead of claims | BP, LH, CC | Each success criterion gets an ID (`SC-1`) and an optional `verify:` (command, URL or manual). `wf check <issue> SC-1 --evidence <commit / log path / screenshot>`. Lint `E-unverified-done` fires when status=done but criteria have no evidence. The progress ring shows **verified** and **claimed** separately. | P0 |
| 3 | Agents grade their own work too leniently, so use a separate evaluator calibrated with examples | HD, BP | The `review` column is a gate. A `reviewing-issue` skill (`context: fork`, fresh context) checks the diff against goal.md criteria and writes `verified_by:` per criterion. Lint fails when author = verifier. Rubric and calibration examples live in `library/playbooks/review-rubric.md`. | P0 |
| 4 | Machine-critical lists can't be freely edited ("unacceptable to remove or edit tests"); JSON was chosen over Markdown because models overwrite it less | LH | Criteria and plan steps carry stable IDs. The daemon diffs git history and raises `W-criteria-mutated` when a criterion is removed or reworded after `in_progress` without a decision entry that cites it. Option: keep criteria in frontmatter YAML. | P0 |
| 5 | Use hooks for steps that must always happen; CLAUDE.md is only advisory | BP, HK | The `workflow` plugin ships these hooks. **SessionStart** (startup/resume/compact) injects `wf resume --current --format concise` as additionalContext. **PreCompact** runs `wf snapshot` to write current_state. **Stop** runs `wf lint --gate` and exits 2 if current_state is stale or an entry has no author. **PostToolUse** on `issues/**` lints the edited file. **TaskCompleted** checks criteria. | P0 |
| 6 | Context is finite: load the smallest high-signal set, fetched just in time by identifier | CE, BP | `wf context <issue> --format concise\|detailed --since` returns a digest: goal, criteria status, open decisions, last N changes. Archify JSON is replaced with `[diagram workflow "Deploy", 14 nodes → plan.md#L40]`. Skills say to use this instead of reading all files. `W-file-bloat` suggests `wf archive` once changes.md is too long. | P0 |
| 7 | Claim tasks with file locks and avoid having several agents edit the same file | CC, AT | `wf claim <issue>` does a compare-and-swap on `claimed_by/claimed_at` and errors with "claimed by @codex 12m ago; `--steal` after 2h". `wf append` = flock + O_APPEND + a ULID per entry, plus `.gitattributes merge=union` on changes/decisions/learnings. Kanban card shows a lock badge. | P0 |
| 8 | Tool design: few consolidated tools, readable IDs, errors that steer, safe defaults, terse output | WT, BEA, CC | `wf` is the interface agents use: `append, check, claim, resume, context, promote, search, lint`. It uses slugs, not UUIDs. `--author` is required (default `WF_AUTHOR`). Errors steer, e.g. "unknown type 'decison'; use change\|decision\|learning". `--json` for scripts. Output is ~2k tokens by default with a truncation notice. Lint output is grep-able, one line each: `ERROR file:line rule fix`, plus counts. | P1 |
| 9 | Explore → plan → implement → commit, one unit per session, clean state at the end; skip planning for one-sentence diffs | BP, LH | `planning-issue` writes plan.md as phases → steps, each with `done_when:`. `executing-issue` does one step, verifies, commits, runs `wf append`, updates current_state. Change entries carry `commit:`. backlog→planned needs plan.md unless `size: S`. | P1 |
| 10 | Sprint contract: generator and evaluator agree what "done" means before each chunk | HD | Each plan phase's `done_when` is accepted through a decision entry before work starts. The UI stepper shows a contract tick per phase. | P1 |
| 11 | Have the agent interview the user, then write a self-contained spec (files, out-of-scope, end-to-end verification) | BP, HD | A `scoping-issue` skill (AskUserQuestion) writes goal.md with sections Goal / Success criteria / Out of scope / Verification / Links. Lints: `W-no-out-of-scope`, `W-no-verification`. | P1 |
| 12 | Skills: progressive disclosure, SKILL.md <500 lines, references one level deep, description says what + when in third person, gerund names | SK, SBP, SKD | Plugins: **workflow** (scoping-issue, planning-issue, executing-issue, handing-off, reviewing-issue), **library** (searching-library, promoting-learning, curating-library), **agent-execution** (verifying-work, delegating-to-subagents, managing-context). `wf skills lint` checks length, description+when_to_use ≤1,536 chars, nested refs, and that side-effect skills set `disable-model-invocation: true`. The archify flowchart goes in the README and the Library page. | P1 |
| 13 | Write evals before skills: 20–50 tasks taken from real failures, grade outcomes rather than paths, track pass^k | EV, SBP, MA | `evals/<skill>/*.json` holds ≥3 scenarios each with an expected_behavior rubric. `wf eval` runs `claude -p` in a clean worktree. Each promoted "gotcha" proposes a regression eval. | P1 |
| 14 | Keep CLAUDE.md short (<200 lines); move procedures into skills or path-scoped rules | BP, MEM | Workspace ships `AGENTS.md` (≤60 lines: layout, `wf` verbs, entry format, "never hand-edit past entries"). `CLAUDE.md` is just `@AGENTS.md`. `.claude/rules/issues.md` has `paths: issues/**`. | P1 |
| 15 | Retrieve the library just in time instead of preloading it; avoid content that goes stale | CE, SBP | `wf library search "<q>" --k 5` returns title, one-liner and path, and skills say to read only 1–2 hits. Entries need `applies_to`, `last_verified`, `source_issue`. Lint `W-stale-library` at >180d. Promotion dedups before it adds. | P1 |
| 16 | Subagents return 1–2k-token summaries and write their artifacts to files | CE, MA | Subagents write `issues/<x>/notes/<topic>.md` and add a learning that links to it. The drawer shows notes as collapsible attachments. | P2 |
| 17 | Keep the session as a durable append-only event log outside the context window; the harness is stateless and can resume | MG, MA | changes.md is that log. Lint `E-history-rewritten` checks git diffs. Entry header format: `### <ISO> @claude-opus [session:abc] [commit:9f1e]`. The daemon index is rebuilt purely from files. Timeline filters by author and session and has a rewind scrubber. | P2 |
| 18 | Human checkpoints, stopping conditions, visible planning | BEA | Decisions carry `status: proposed\|accepted\|superseded` and `needs: @human`, which feed a **Needs you** inbox in the left pane. `blocked` requires `blocked_on:`. The stepper shows the live current step. | P2 |
| 19 | Scale effort to complexity; multi-agent setups fit tightly coupled coding poorly | MA, AT | `size: S\|M\|L` in goal.md. S has no plan and no reviewer. L gets plan + contract + reviewer. Agent teams only for research and review. | P2 |
| 20 | Start simple, and strip out scaffolding once models no longer need it | BEA, HD, MG | Log hook/skill/lint hits to `.wf/usage.jsonl`. A periodic `curating-library` pass deletes rules that aren't doing anything. | P2 |
| 21 | Treat skills and content as untrusted | SK, CX | Sanitize rendered markdown. Put archify HTML in a sandboxed iframe (no same-origin). `wf skills install` pins a git SHA. | P2 |

## Practices that argue against the current requirements

1. **Markdown checkboxes as the source of truth for criteria and plan** (LH). The long-running-agents post chose JSON because models are less likely to overwrite it. Fix: stable IDs plus `W-criteria-mutated` (#4), or move criteria into frontmatter.
2. **Progress % derived from boxes the agent ticks itself** (HD leniency; BP's "trust-then-verify gap"). This would make the dashboard show self-reported progress as fact. Fix: verified vs claimed, evidence, and author ≠ verifier (#2, #3).
3. **Inline archify JSON inside goal.md and plan.md** (CE context rot). Every agent read pays for large JSON blobs. Fix: `wf context` collapses them to a one-line stub. Option: `archify <type> src=diagrams/x.json` sidecar files.
4. **Five files that only grow, read in full** (CE, BP). Fix: `current_state.md` plus the `wf context` digest and `wf archive` (#1, #6). This adds a sixth file, which needs confirming.
5. **A plan for every issue** (BP: "If you could describe the diff in one sentence, skip the plan"). Also, issues "can be anything". Fix: `size: S` / `plan: skip`.
6. **Many agents editing the same issue files at once** (AT: "Two teammates editing the same file leads to overwrites"; MA: coding is a poor multi-agent fit). Fix: `wf claim` plus append-only `wf append`, and hooks that flag hand edits (#7).
7. **Wide v1 scope** (BEA "start simple"; HD "remove scaffolding"). v1 currently bundles SSE, kanban write-backs, archify, library promotion, 3 plugins, a CLI and evals. Suggested order: index, kanban/drawer/timeline, `wf append/claim/resume/lint` and hooks first. Then write-backs, then the library UI.

## Assumptions to confirm

- Adding `current_state.md`, criterion/step IDs, and the `verify/evidence/verified_by` fields to the schema.
- `merge=union` git strategy for append-only files.
- Workspace-root `AGENTS.md` as the cross-agent entry point, with `CLAUDE.md` importing it.

## Sources

- **BEA**: https://www.anthropic.com/engineering/building-effective-agents
- **CE**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **MA**: https://www.anthropic.com/engineering/multi-agent-research-system
- **LH**: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **HD**: https://www.anthropic.com/engineering/harness-design-long-running-apps (Mar 2026)
- **CC**: https://www.anthropic.com/engineering/building-c-compiler (Feb 2026)
- **WT**: https://www.anthropic.com/engineering/writing-tools-for-agents
- **EV**: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (Jan 2026)
- **MG**: https://www.anthropic.com/research/managed-agents (Apr 2026)
- **CX**: https://www.anthropic.com/engineering/code-execution-with-mcp
- **SK**: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- **SBP**: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- **SKD**: https://code.claude.com/docs/en/skills
- **BP**: https://code.claude.com/docs/en/best-practices
- **MEM**: https://code.claude.com/docs/en/memory
- **HK**: https://code.claude.com/docs/en/hooks
- **AT**: https://code.claude.com/docs/en/agent-teams
- Also read: https://www.anthropic.com/research/redesigning-source-control (Oct 2026: append-only, lock-free commits at agent scale)
- Found in search but not read in full: https://www.anthropic.com/news/context-management (memory tool, context editing, compaction)