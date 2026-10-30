---
name: planning-issues
description: Use when a wf issue has a goal.md but no plan.md, or its plan must be revised, and someone asks to plan it, break it into tasks, write the plan or "make it ready for work". Writes plan.md with phases and tasks (status, lane, depends_on, owns, satisfies, verify) and moves the issue to planned. Avoid for creating issues (use adding-work), for doing a task (use doing-next-step), and for xs or s issues whose one step is obvious.
---

# Planning issues

A plan turns the criteria of `goal.md` into tasks that one agent can finish in one session each, and that several agents can run in parallel. Read `../using-wf/SKILL.md` section 1 and `../using-wf/references/format.md` sections 6, 7, 10 and 12 first.

## Steps

1. **Find the issue.** `../using-wf/scripts/wf-env.sh issue <id|slug|path>` prints its folder. Read `goal.md`, then `current_state.md`, `decisions.md` and `plan.md` if they exist.
   - `status` is `backlog` or `planned`: write a new plan.
   - `status` is `in_progress`, `blocked` or `review`: revise. Raise `revision`, keep every task that is not `todo`, never renumber a task, and add new tasks with the next free `T-n`.
   - `status` is `done` or `cancelled`: stop and ask.
2. **Check the criteria.** Each `SC-n` must be an EARS sentence with a measurable response and a `verify:`. If one is vague, fix it in `goal.md` with a minimal edit (one line) and say so in the report. Never delete a criterion.
3. **Consult the library first.** Search reviewed items: `grep -rli "<key words>" <root>/<library_dir>` and keep only files with `status: reviewed`. Read the top 1 or 2 and list the ones that apply under `## Prior art` as `- [[lib-xxxxx]]: <why it applies>`. A match on a common word ("event", "record") is not prior art: when nothing applies, leave out `## Prior art`.
4. **Write `## Approach`**: at most 5 short sentences, in present tense, saying how the work gets done. Add `## Assumptions` (`- A1: ... [open]` or `[confirmed]`) for anything you do not know.
5. **Decompose into tasks.**
   - One task fits one agent session: at most 5 steps, one coherent set of files.
   - Every task has `lane` (area of the work, for example `core`, `server`, `web`, `docs`), `owns` (paths or globs it edits), `satisfies` (the `SC-n` it proves), `verify` (a command in backticks, or `manual`).
   - Keep `owns` disjoint between tasks that can run at the same time. The overlap test compares the text before the first glob character, so `tests/test_event.py` overlaps `tests/test_events.py`: give parallel tasks file names that do not start with each other. Add `depends_on` only for a real order. Make the ready set as wide as the work allows.
   - Every `SC-n` is covered by at least one task, and every task satisfies at least one criterion.
   - Group tasks into `## Phase N: <name>` sections of at most 10 tasks. Keep the whole plan under 200 lines.
   - Titles are imperative, verb first, one shape for the whole list (`writing-readable-bulk-text`). Steps are `- [ ]` lines of at most 20 words, each starting with a verb.
   - Do not set `claimed_by` or `lease_until`. Set `assignee` only if the issue names one.
6. **Write `plan.md`** from the template in `format.md` section 6. Frontmatter: `updated_at` is `wf-env.sh now`, `updated_by` is your quoted handle, `revision` is 1 (or the old one plus 1).
7. **Move the issue.** In `goal.md` change only the `status:` line: `backlog` to `planned`. A revision leaves the status alone.
8. **Leave a trail.** Append a change entry with `logging-work` (`kind: docs`, `plan.md` under `files`, title "Wrote the plan with N tasks in M lanes"). If `current_state.md` is missing, create it with `summary` "Planned: N tasks in M lanes; <the ready ids> ready." (for example "T-1 and T-2 are ready.", ids from `wf-status.sh --ready`), `phase` the first phase, and `Next steps` 1 "Claim T-1 and start the first step."; if it exists, change only `summary`, `updated_at`, `updated_by` and `Next steps`.
9. **Check.** `pnpm -s -C web wf:lint <root>`; fix findings in the files you touched (max 3 rounds). Then run `../checking-status/scripts/wf-status.sh --ready <id>` to confirm the first tasks are ready. Report the task count, the lanes and the ready tasks.

An xs or s issue with one obvious step may skip the plan when a person only asks to look at it. `doing-next-step` plans every issue that has no `plan.md` as the first step of its run (a one-task plan is fine), so the lease and the log entry always name a task.

## Example

Issue `wf-3k9x2` (Push board updates over SSE) has 5 criteria. The plan has 3 phases and 5 tasks in 3 lanes. T-1 and T-2 own `crates/wf-index/src/delta.rs` and `watch.rs`, so both are ready on day one. T-3 depends on both, T-4 depends on none, T-5 depends on T-3 and T-4.

```markdown
### T-4: Elect one leader tab over BroadcastChannel
- status: todo
- lane: web
- owns: `web/src/lib/live/leader.ts`
- satisfies: SC-4
- assignee: role:frontend
- verify: `pnpm -C web test leader`

Elect one leader tab with the Web Locks API. The leader opens the `EventSource` and relays each event to the other tabs over `BroadcastChannel`.
- [ ] Take the `wf-live` lock in each tab.
- [ ] Relay events from the leader over `BroadcastChannel`.
```

## Red flags

- A task has no `verify` or no `satisfies`.
- Two parallel tasks own the same file.
- A task needs more than one session, or its title says "and".
- You renumbered or deleted a task that is already `in_progress` or `done`.
- You wrote hedge words ("probably", "may") in the approach. List the doubt as an assumption.
