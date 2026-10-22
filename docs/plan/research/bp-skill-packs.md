# Skill-pack survey and recommended skills for the `workflow`, `library` and `agent-execution` plugins

## 1. Sources (read 2026-10-22; stars as shown on each page)

| Pack / URL | License | Main skills and ideas | Why its descriptions trigger well |
|---|---|---|---|
| **andrej-karpathy-skills** (forrestchang; ~222k) github.com/forrestchang/andrej-karpathy-skills | MIT | One `karpathy-guidelines` skill plus CLAUDE.md and a Cursor rule, built on four rules. (1) Think before coding: state assumptions, offer several readings, ask when unclear. (2) Simplicity first: would a senior engineer call this overcomplicated? (3) Surgical changes: every changed line must trace back to the request; mention dead code rather than delete it. (4) Goal-driven execution: turn the task into verifiable criteria and give each plan step a check. | The description names the symptoms it fixes ("overcomplication… surgical changes… surface assumptions… verifiable success criteria") and the trigger ("Use when writing, reviewing, or refactoring code"). |
| **Karpathy's original post**, 2026-01-26: x.com/karpathy/status/2015883857489522876 (read via threadreaderapp) | n/a | Agent errors are now subtle conceptual ones: unverified assumptions, bloated abstractions, dead code, edits to code unrelated to the task. Agents loop well toward clear success criteria (tests first, a browser tool). CLAUDE.md instructions helped only a little. | n/a |
| **obra/superpowers** (~303k) github.com/obra/superpowers | MIT | brainstorming (hard gate: nothing gets built until the design is approved; one question per message; 2–3 approaches with a recommendation), writing-plans (exact file paths, a verify command and expected output per step), executing-plans, subagent-driven-development (fresh implementer per task, then a reviewer; statuses DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), dispatching-parallel-agents, test-driven-development, systematic-debugging (4 phases; after 3 failed fixes, question the architecture), verification-before-completion ("no completion claims without fresh verification evidence"), requesting- and receiving-code-review, using-git-worktrees, finishing-a-development-branch, writing-skills, using-superpowers | Descriptions are "Use when…" plus a trigger only, never a summary of the workflow (an agent that reads a summary follows it and skips the body). The using-superpowers bootstrap sets a "1% rule". Discipline skills carry an Iron Law, a rationalization table and a red-flags list. writing-skills does TDD for skills: record agents failing under pressure scenarios first. |
| **EveryInc/compound-engineering-plugin** (~25.6k) github.com/EveryInc/compound-engineering-plugin; every.to/guides/compound-engineering | MIT | Loop: brainstorm → plan → work → simplify → review → compound, with about 80% of effort in planning and review. `ce-compound` writes one learning per run to `docs/solutions/`, but only if it passes a counterfactual test (would a future engineer repeat the mistake without it?). It updates an existing learning rather than duplicating it. `ce-compound-refresh` audits learnings as Keep / Update / Consolidate / Replace / Delete. `ce-plan` reads past learnings as grounding. Also ce-debug, ce-handoff, ce-promote, and `lfg` (runs the whole pipeline hands-off). | Descriptions say both when to use and when to avoid ("avoid routine fixes whose artifacts already explain the lesson"). |
| **anthropics/skills** (~183k) github.com/anthropics/skills | Mostly Apache-2.0 (skill-creator's LICENSE.txt is Apache-2.0). **docx/pdf/pptx/xlsx are source-available: do not redistribute.** | skill-creator (capture intent → draft → evals with and without the skill → benchmark → revise; description optimizer using about 20 queries with near-miss negatives and a 60/40 train/test split), doc-coauthoring, mcp-builder, webapp-testing, frontend-design, plus the `spec/` and `template/` folders | Claude tends to undertrigger, so descriptions should be "pushy". All "when to use" text goes in the description, none in the body. |
| **mattpocock/skills** (~300k) github.com/mattpocock/skills | MIT | grill-me / grilling, to-spec, to-tickets, triage, handoff, retro, diagnosing-bugs, tdd, code-review (checks the diff against the originating spec), domain-modeling (glossary and ADRs), writing-for-agents, ask-matt (router) | Splits skills into **user-invoked orchestrators** and **model-invoked techniques**. Orchestrators may call techniques, but not other orchestrators. |
| **planning-with-files** (OthmanAdi; ~27.6k) | MIT | Manus-style `task_plan.md` / `findings.md` / `progress.md`. Save findings after every 2 view or browse operations; log every error; never repeat a failed attempt. Hooks (SessionStart, PreCompact, Stop and others) re-inject the plan and check completion. | Hooks enforce what descriptions alone cannot. |
| **GSD** (gsd-build, 64.3k, archived; now open-gsd/gsd-core) | MIT | discuss → plan → execute → verify → ship. Each executor gets a fresh context; plans must fit one context window; STATE.md and CONTEXT.md persist across sessions. | n/a |
| **HumanLayer** `.claude/commands` (11.7k) | Apache-2.0 | research → plan → implement, frequent intentional compaction, `create_handoff` / `resume_handoff` (sections: tasks, critical references, recent changes, learnings, artifacts, next steps) | n/a |
| **Standards**: agentskills.io/specification; code.claude.com/docs/en/skills; platform.claude.com/…/best-practices; AGENTS.md (now under the Agentic AI Foundation) | n/a | name ≤64 characters, lowercase and hyphens, must match its directory. description ≤1024 characters. Claude Code cuts description plus `when_to_use` at 1,536 characters in its skill listing. Body under 500 lines; references one level deep. Third person; gerund names; no "claude" or "anthropic" in names. Supports `disable-model-invocation`, `context: fork`, `paths`, and `` !`cmd` `` injection, which aborts the skill if the command fails. AGENTS.md guidance: keep it to narrow facts the agent cannot infer (commands, gotchas, verification). | n/a |

## 2. House rules for our SKILL.md files

1. Make the description say when to use the skill, not how it works. Use the form "Use when \<trigger or symptom\>…; avoid \<near-miss\>." Write it in third person, lead with the key use case, keep it pushy, and stay under 1024 characters.
2. Mark orchestrators `disable-model-invocation: true`; techniques stay model-invoked (from mattpocock).
3. Ship a bootstrap skill and a SessionStart hook that injects `` !`wf status --brief || true` `` (from superpowers and planning-with-files).
4. Give every discipline skill an Iron Law, a rationalization table and a red-flags list (from superpowers).
5. Deterministic work belongs in `wf` subcommands, and skills call them; they don't reimplement them (Anthropic's "solve, don't defer").
6. Gate every skill on evals: a baseline run without the skill, then trigger queries that include near-miss negatives (from skill-creator and writing-skills).

## 3. Recommended skills

### `workflow` plugin (issue lifecycle)

| Skill | Borrows from | Plugs into |
|---|---|---|
| `using-workflow` (bootstrap/router) | superpowers using-superpowers (1% rule); mattpocock ask-matt | SessionStart hook; points to the archify skill-flowchart; `wf status` |
| `framing-issues` | superpowers brainstorming (hard gate, one question at a time, 2–3 options); mattpocock grill-me; Karpathy rule 1 | `wf new issue <group>/<slug>` writes goal.md: frontmatter `status: backlog`, Assumptions, verifiable Success Criteria checklist, optional `archify architecture` block |
| `planning-issues` | superpowers writing-plans (verify command per step); ce-plan (learnings as grounding); GSD (plan fits one context) | First runs `wf library search`, then writes plan.md as a phased checklist (`- [ ] step — verify: \`cmd\` → expect`), a "Prior art" section citing library IDs, and an `archify workflow` block. Sets `status: planned` |
| `executing-plans` | superpowers executing-plans; GSD waves | `wf tick plan <n>`; `wf log change --author @agent` (atomic append) |
| `recording-decisions` | mattpocock domain-modeling (ADRs) | `wf log decision`: context, options, choice, consequences. Renders as ADR cards |
| `handing-off` | HumanLayer create/resume_handoff; mattpocock handoff; ce-handoff | Overwrites **current_state.md** (proposed 6th file: status, critical refs, next actions, open questions); PreCompact/Stop hook |
| `closing-issues` | superpowers finishing-a-development-branch plus verification | Every criterion needs evidence; `wf lint --drift`; status review → done; then hands off to `compounding-learnings` |
| `triaging` (user-invoked) | mattpocock triage, to-tickets | Splits an issue into sub-issues under a nested group; `_group.md` |

### `library` plugin (knowledge library)

| Skill | Borrows from | Plugs into |
|---|---|---|
| `consulting-library` | ce-plan / ce-brainstorm grounding | "Use when starting, planning, or debugging an error seen before." Runs `wf library search --json`; cites entry IDs in plan.md |
| `compounding-learnings` | ce-compound: counterfactual write bar, one learning per run, update instead of duplicate | Appends a tagged entry to learnings.md (`@author`, tags, `promote: candidate`). Writes nothing when the bar isn't met and says why |
| `promoting-to-library` | ce-promote; ce-compound dedupe | `wf library promote <issue>#<id> --kind pattern\|playbook\|gotcha` with a provenance backlink; a human approves via PR |
| `refreshing-library` | ce-compound-refresh (Keep / Update / Consolidate / Replace / Delete) | `wf library audit` checks `last_verified`, code references and contradictions; deletes only after confirmation |
| `authoring-skills` | anthropic skill-creator (evals, description optimizer); superpowers writing-skills (TDD for skills); mattpocock writing-for-agents, retro | Graduates a mature playbook into a SKILL.md in one of the 3 plugins; `wf skills eval` |

### `agent-execution` plugin (execution quality)

| Skill | Borrows from | Plugs into |
|---|---|---|
| `coding-guidelines` | Karpathy's 4 rules, verbatim structure (MIT, credited) | Also shipped as an AGENTS.md / CLAUDE.md snippet via `wf skills install`. "Every changed line traces back to the request" check on changes.md entries |
| `verifying-before-done` | superpowers verification-before-completion | `wf tick --evidence "<cmd> → exit 0"`. The dashboard flags criteria ticked without evidence |
| `debugging-systematically` | superpowers systematic-debugging; mattpocock diagnosing-bugs; planning-with-files error log | Hypothesis and attempt log in changes.md. After 3 failed fixes: write a decision entry and set `status: blocked` |
| `test-first` | superpowers TDD; mattpocock tdd | Generalized for non-code issues as "write the acceptance check first" |
| `dispatching-subagents` | superpowers subagent-driven-development and dispatching-parallel-agents; GSD fresh contexts | Each subagent gets a brief from one plan.md step plus interfaces, never the whole history. Its DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED status goes to `wf log change --status`. Spec review, then quality review |
| `keeping-context-lean` | planning-with-files 2-action rule; HumanLayer frequent intentional compaction; GSD context rot | Saves findings to current_state.md; hooks re-inject goal.md and plan.md after compaction |
| `reviewing-work` | superpowers requesting- and receiving-code-review; ce-code-review (report-only default); mattpocock code-review (against the spec) | Reviews against goal.md criteria and plan.md; findings become review entries in changes.md |

## 4. Ideas that most strengthen agent execution

1. **Success criteria are the steering signal.** Karpathy's point is that agents loop well toward checkable goals. So goal.md criteria must be verifiable, and `wf lint` should warn on vague ones.
2. **Evidence-gated completion.** Ticking a box or moving a card to done requires a fresh command result; this is the superpowers Iron Law enforced by the CLI.
3. **Fresh context per task, coordinated through files.** Subagents work from a brief and report a status (superpowers, GSD). Our atomic `wf log` appends already make parallel agents safe.
4. **Disk as memory.** Write findings every 2 operations and keep a handoff state that survives compaction and session changes (planning-with-files, HumanLayer).
5. **A ceiling on failed fixes.** After 3 failed fixes the agent escalates to a decision and sets `status: blocked`, rather than thrashing.
6. **Only reusable learnings compound.** The counterfactual bar stops library bloat (ce-compound).
7. **Rationalization tables plus hooks.** Description wording alone undertriggers.

## 5. Redistribution notes

- **MIT** (Karpathy, superpowers, compound-engineering, mattpocock, planning-with-files, GSD): adapting is fine if we keep the copyright and license notice. Put both in `THIRD_PARTY_NOTICES.md`, and in each adapted skill set `license: MIT` and `metadata.source: <url>`.
- **Apache-2.0** (anthropics skill-creator, HumanLayer): include the license, keep any NOTICE file, and mark modified files.
- **Never** copy anthropics docx/pdf/pptx/xlsx: they are source-available, not open source.
- Our names must not contain "claude" or "anthropic".

## 6. Gaps and assumptions to confirm

- **Unverified:** spec-kit and BMAD are listed as MIT only by secondary sources, and the BMAD license claim is for V6. ce-compound's learning-file schema isn't documented in the parts I could read, and neither is how ce-plan searches past learnings (both are in reference files I didn't fetch). Star counts move daily.
- **current_state.md** is not one of the user's 5 files. I'm proposing it as an optional 6th file; it could instead be a section of plan.md.
- Gerund skill names under each plugin's namespace (for example `/workflow:planning-issues`) are my choice; confirm before building.