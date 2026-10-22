# Agent practices mapped onto `workflow`

## 1. The three questions

**How many agents should write to one issue? One at a time. Any number may read.**
- **Evidence:**
  - Cognition's June 2025 essay and its April 2026 follow-up reach the same conclusion: multi-agent setups "work best today when writes stay single-threaded." Extra agents should add intelligence (review, research, a stronger model on call), not actions. Agents writing in parallel make conflicting hidden choices about style and edge cases.
  - In Cursor's experiments, shared-file locks cut 20 agents down to the throughput of 2–3. Agents treated as equals became risk-averse. What worked was a planner → worker hierarchy where each worker had its own task.
- **Fields:** add `writer: @codex` and `lease_until:` to `goal.md` frontmatter. This is a lease with a time limit that the writer renews, not a hard lock.
- **Commands:** `wf claim` / `wf release`. Only the writer may change `plan.md`, `decisions.md` and `current_state.md`. Other agents may only append `kind: review|research|scout` entries to `changes.md`.
- **Parallel work inside an issue:** split it into child issues (nested folders) with non-overlapping `scope:` globs. Each child has its own writer, and the parent's writer acts as manager. Lint warns when siblings that are `in_progress` have overlapping scopes.
- **Avoiding conflicting assumptions:**
  - `plan.md` gets a required `## Assumptions` section, with entries like `A1 … [open|confirmed]`.
  - Once an assumption is confirmed it becomes a `decisions.md` entry.
  - The handoff to a child copies accepted decisions explicitly, because Cognition found managers wrongly assume children share their state.
  - Children report back with `wf append --to parent`, because Cognition also found children don't send findings upward by default.
- **Dashboard edits** (dragging a card to change status, ticking a checkbox) go through the same queue as agent writes. Each edit carries a content-hash precondition: if the file changed since it was read, the edit is rejected and retried, never written blindly.

**`current_state.md`** is the file the agent keeps rewriting so the plan stays in view. It combines three ideas: Manus's `todo.md` recitation, Factory's anchored summary, and HumanLayer's intentional compaction.
- **Required sections, in this order.** The last section is closest to the end of the context, where attention is strongest.
  1. `Intent` (2 lines or fewer)
  2. `Phase/Status`
  3. `Done` (pointers only)
  4. `Files touched`. The daemon generates this from git; it is not summarized by an LLM. File tracking scored lowest for every compression method Factory tested (2.19–2.45 out of 5).
  5. `Failed attempts` (one line each, with the error signature)
  6. `Needs human`
  7. `Active decisions` (IDs only)
  8. `Next step` (exactly one)
- **Budget:** 80 lines or about 1.5k tokens or fewer. Lint warns above 2k tokens and errors above 4k.
- **Updating:** merge changes into the affected sections. Never regenerate the whole file, because regenerated summaries drift. The writer updates it at every phase boundary and before any handoff.

**Handoff bundle** (`wf handoff <issue> [--child]`)
- **Contents:**
  - goal and unmet criteria
  - `current_state.md`
  - the current plan phase only
  - accepted decisions that are not superseded, one line each
  - the last 5 `changes.md` entries
  - the top 3 library hits, with dates
  - everything else as file paths, so the content can be reloaded if needed
- **Budget:** 6k tokens or fewer, about 3–4% of a 170k window. That starts the next agent well below the roughly 40% fill level where Horthy says quality drops (his "dumb zone"), and inside HumanLayer's 40–60% working range.
- **Why so small:** in Chroma's tests, focused prompts of about 300 tokens beat full prompts of about 113k tokens for every model family. Even one distractor reduced accuracy. So superseded decisions and near-duplicate library entries are left out, not just ranked lower.
- **Fresh starts:** prefer a new session plus the bundle over compacting the same session again and again. Osmani and Cursor both recommend periodic fresh starts.

**What goes in context vs on disk**

| In context | On disk, pointer only |
|---|---|
| Goal and unmet criteria, current phase steps, assumptions, active decisions, the current error, the next step | Full `changes.md` timeline, finished phases, research notes, resolved stack traces, diffs, rendered diagram HTML, raw archify JSON, the full library |

## 2. Practice table

| # | Practice | Source | Adoption | P |
|---|---|---|---|---|
| 1 | One writer per issue; other agents read and review | [Cognition '25](https://cognition.com/blog/dont-build-multi-agents), [Cognition '26](https://cognition.com/blog/multi-agents-working) | `writer:` + `lease_until:`, `wf claim`, child issues with disjoint `scope:` | P0 |
| 2 | Locks fail; use optimistic concurrency plus a hierarchy | [Cursor](https://cursor.com/blog/scaling-agents) | `wf append` writes whole entry blocks atomically; in-place edits need a hash precondition; leases instead of locks | P0 |
| 3 | Rewrite the plan at the end of context; use the filesystem as memory you can reload | [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) | `current_state.md` ends with `Next step`; the bundle holds paths, not content; a Stop hook warns when the file is stale | P0 |
| 4 | Keep errors in context, compacted | Manus; [12-factor F9](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-09-compact-errors.md) | `kind: failure` entries shown red on the timeline; `Failed attempts` section, deduplicated by error signature | P1 |
| 5 | Append-only history, deterministic serialization | Manus | Old entries in changes/decisions/learnings are never edited; corrections are new entries with `supersedes:`; lint flags edits; bundle order is deterministic | P1 |
| 6 | Research → plan → implement; compact at phase ends; keep context use around 40–60% | [HumanLayer ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) | Status gates (`planned` requires a plan with a verify step per phase); a `wf-compact` skill runs at each phase boundary | P0 |
| 7 | Small instruction budget (about 150–200 instructions); plans of about 200 lines or fewer | Horthy 2026 ([secondary](https://chensg.substack.com/p/beyond-vibe-coding-the-engineering)), [HumanLayer CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) | Lint warns when `plan.md` exceeds 200 lines or a phase exceeds 10 steps | P1 |
| 8 | Humans must review code, not only plans | Horthy 2026 (secondary) | `changes.md` entries carry `commit:`/`pr:`; the timeline shows diff stats | P1 |
| 9 | A reviewer with a clean context, separate from the writer | Cognition '26 | A `review` skill gives a fresh agent only the goal and the diff; output is appended as `kind: review` | P0 |
| 10 | Agents shouldn't grade their own work; lock the tests | [Osmani](https://addyosmani.com/blog/long-running-agents), [Ralph](https://ghuntley.com/ralph/) | A criterion counts toward progress only if it has a passing `verify:` or `verified_by` ≠ writer; changing criterion text after `in_progress` requires a decision entry | P0 |
| 11 | State assumptions; make goals verifiable; change only what the task needs | Karpathy via [forrestchang](https://github.com/forrestchang/andrej-karpathy-skills) | Lint requires `verify:` on each criterion; `## Assumptions` in the plan; the execution skill includes all four rules | P0 |
| 12 | Own the control flow; keep state in one place; each step is a pure function of state | [12-factor](https://github.com/humanlayer/12-factor-agents) F5/F8/F12 | Rust enforces legal status transitions; the files are the only state; the in-memory index can be rebuilt from disk | P0 |
| 13 | Contacting a human is a tool; escalate on repeated failure or high-risk actions | 12-factor F7; [OpenAI guide](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) | `wf ask @shruti "…"` sets `blocked` + `needs:`; a "Needs you" badge/lane; an `attempts:` counter auto-blocks after 3 failed verify runs | P0 |
| 14 | Small, focused agents (3–10 steps) | [12-factor F10](https://github.com/humanlayer/12-factor-agents/blob/main/content/factor-10-small-focused-agents.md) | One plan phase per session | P1 |
| 15 | A queue of ready work, with dependencies | [Beads](https://github.com/steveyegge/beads) | `depends_on:` in frontmatter; `wf ready --json`; "blocked by" links on cards | P1 |
| 16 | One item per loop; brief learnings; "don't assume not implemented" | Ralph | A required `wf lib search` before planning; learnings of 3 lines or fewer | P1 |
| 17 | Retrieve memory selectively; watch for poisoning, distraction, confusion and clash | [LangChain](https://www.langchain.com/blog/context-engineering-for-agents), [Breunig](https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html) | Library entries get `status: active\|superseded`, `applies_to:`, `last_validated:`; search returns the top 3; promotion needs human approval; lint flags contradicting active decisions | P0 |
| 18 | Focused context beats long context; distractors hurt | [Chroma](https://www.trychroma.com/research/context-rot) | Bundle budget; superseded material excluded | P0 |
| 19 | Summaries with fixed sections, merged rather than regenerated; track files separately | [Factory](https://factory.com/news/evaluating-compression) | Required sections in `current_state.md`; file index generated by the daemon | P0 |
| 20 | Short root instructions, loaded progressively; deterministic linters instead of prose rules | HumanLayer; [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) (32 KiB cap; [nearest file wins](https://agents.md/)) | `wf skills install` writes an AGENTS.md snippet of 60 lines or fewer; optional per-group AGENTS.md; style rules live in `wf lint`, not skill text | P1 |
| 21 | Maximize a single agent first; build instructions from existing procedures; measure against evals | OpenAI guide | Skills assume one agent per issue; `wf lib to-skill` turns playbooks into skills; each skill ships with eval cases | P2 |
| 22 | Run parallel agents for research and scouting; review is the bottleneck; sandbox them | [Willison](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/), [loops](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/) | `kind: scout` runs that never land code; a limit on cards in the review column; a worktree or container per writer | P1 |
| 23 | Heavy specs are overkill for small tasks | [Böckeler](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | `size: xs` issues have only `goal.md`; other files are created when first needed | P0 |

## 3. Practices that argue against the requirements

1. **Archify JSON written inline in `goal.md`/`plan.md`** adds hundreds of tokens of noise to the files agents read most (Chroma, Manus).
   - Option: `wf show --agent` collapses each archify block to a one-line stub like `[diagram workflow "…" 12 nodes]`.
   - Option: allow `archify-src: diagrams/x.json` to keep the JSON in a separate file.
2. **Five files for every issue** is the spec overkill Böckeler criticizes: verbose markdown that is tedious to review, and a "sledgehammer" for small bugs. Use size tiers and create files lazily.
3. **"Safe under concurrent agent edits" does not make concurrent writers a good idea.** Atomic appends prevent corrupted files, not contradictory decisions (Cognition). Enforce the single writer; support parallel work only through child issues.
4. **Progress % from checkboxes the agent ticks itself** will read too high (Osmani, Cognition's review loop). It needs verification by someone other than the writer, or a passing check.
5. **Treating plan review as the main human checkpoint** (ACE-FCA 2025) was reversed by Horthy in 2026: implementation drifts from the plan. The timeline must link to diffs.
6. **A library that agents consult before every issue** risks pulling in stale or wrong memories (Breunig's poisoning, Willison's memory-misfire example). Retrieval must be selective and dated, with human-approved promotion and supersession links.

**Caveats on sources:**
- The OpenAI guide and both Cognition posts were read in full.
- Horthy's 2026 QRSPI material comes from a secondary write-up only; his own talk or post was not found.
- Karpathy's wording comes from the forrestchang repo's quote of [his post](https://x.com/karpathy/status/2015883857489522876), which I did not read directly.