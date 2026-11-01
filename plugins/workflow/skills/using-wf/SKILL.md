---
name: using-wf
description: Use when a task mentions a wf workspace, an issue id such as wf-3k9x2, goal.md, plan.md or current_state.md, the board, "Open in Codex" or "Do next step", or when asked to add work, plan, do the next step, log, hand off or check status without the dashboard. Start here to find the workspace, learn the file formats, pick the right wf skill and see which skill the skills flow runs for each step. Avoid for ordinary coding that no wf issue tracks, and for changing the dashboard's own source code unless an issue asks for it.
---

# Using wf

A wf workspace is a folder of markdown files. An issue is a folder with a `goal.md`. You can run the whole flow from the terminal with these skills, and the dashboard shows every change you make, because both read the same files. Either side can continue the other's work.

## 1. Find the workspace

1. Run `scripts/wf-env.sh root` (path relative to this file). It uses `$WF_ROOT`, else walks up from the current folder to the nearest `workflow.toml`, else looks for `workspace/` and `web/mock/workspace/` in the git repo. Working on a copy or another workspace? Set `WF_ROOT` on every command (`WF_ROOT=<dir> scripts/wf-env.sh root`) because a shell tool call may not keep exported variables, and never run an unguarded `cd "$WF_ROOT"`: an empty variable sends you to the home folder.
2. In this repository the prototype workspace is `web/mock/workspace`. The 26-issue sample world is `web/mock/sample`: a fixture, so do not write there unless the user names it.
3. Read `<root>/workflow.toml`: `issues_dir` (default `issues`), `id_prefix` (default `wf`), `[leases] minutes`. The steps' skills and options (`[flow]`, `[context] budget_tokens`) are read through `scripts/wf-env.sh flow` (section 3).
4. Read `<root>/glossary.md` and `<root>/authors.md` once. Use the glossary's words in everything you write.
5. Judging leases and staleness at another time than the real one (an eval on a copy of the sample world): set `WF_NOW=<RFC 3339 time>` on every command. `wf-env.sh now|later` and `wf-status.sh` then use it.
6. Decide your author handle: `$WF_AUTHOR`, else the `authors.md` entry for your runtime (Codex is `@codex`, Claude Code is `@claude-opus` or `@claude-sonnet`), else ask.

File map of a workspace (full formats in `references/format.md`):

```
workflow.toml  glossary.md  authors.md
issues/<group>/.../<slug>/    goal.md  plan.md  current_state.md  changes.md  decisions.md  learnings.md
issues/<group>/_group.md      library/{patterns,playbooks,gotchas,decisions}/<slug>.md
```

| File | Holds | How you write it |
|---|---|---|
| `goal.md` | id, status, why, success criteria `SC-n` | minimal edits |
| `plan.md` | approach, phases, tasks `T-n` with leases | minimal edits |
| `current_state.md` | what is true now, what is next | overwrite whole |
| `changes.md` `decisions.md` `learnings.md` | the log | append at the bottom |

## 2. Pick the skill

| The user wants to | Step | Built-in skill |
|---|---|---|
| add a group of work or one issue ("+ Add work") | `add` | `adding-work` |
| turn an issue into a plan with tasks | `plan` | `planning-issues` |
| do the next step of an issue ("Do next step") | `do` | `doing-next-step` |
| record a change, a decision or a learning | `log` | `logging-work` |
| give a person or an agent the full context of an issue | `handoff` | `handing-off` |
| see status, requests, stale leases, ready tasks, commits, PRs, CI | `status` | `checking-status` |
| write titles or one-line entries for a list | `style` | `writing-readable-bulk-text` |

The skills flow decides which skill runs a step (section 3). The table shows the skill that runs it when the flow does not change it. "The Plan step's skill" in the other skills means the answer of `scripts/wf-env.sh flow plan`.

`adding-work` and `handing-off` are orchestrators: they run a whole flow and may call the other skills as techniques. The rest are techniques; one skill does not call an orchestrator.

## 3. The skills flow

A team can change which skill runs a step, and a person can change it for themselves. The team default is `[flow.<step>]` in `workflow.toml`; a personal override is the same table in the `library.toml` of the personal library (the dashboard's Settings → Skills flow writes both). The personal value wins, key by key. With no `[flow]`, the built-in skills of section 2 run.

1. **Read the flow once per task.** `scripts/wf-env.sh flow` prints one line per step, `<step> <skill> <source> <origin> [option=value ...]`, then the custom steps (`after:<step> <id> <skill> <required> <origin>`), then one `unresolved ...` line for each skill it could not find (the built-in skill runs instead: say so in your report). `flow <step>` prints one skill, `flow <step> <option>` one option.
2. **Follow the skill the flow names.** A step that names another skill than the built-in one: read its `SKILL.md` (`scripts/wf-env.sh flow path <skill>`) and follow it instead of the built-in skill. Its own `scripts/` and `references/` sit beside it. A skill is a bare name (built-in), `ws:<name>` (the `skills/` of this workspace), `me:<name>` (your personal library) or `<alias>:<name>` (a team library you added). In a skill from `ws:`, `me:` or a library, a path that starts with `../` (for example `../using-wf/scripts/wf-env.sh`) means the built-in folder beside this `using-wf`, not a folder next to that skill: a copy of a built-in skill keeps those paths. Run those scripts from the built-in folders.
3. **Keep the contract.** Whatever skill runs a step, the next step still reads what the step leaves:

   | Step | A skill for it still has to |
   |---|---|
   | `add` | write `goal.md` (status `backlog`) for each issue and `_group.md` for a new group, and report the new ids |
   | `plan` | write `plan.md` in the format of `format.md` section 6, set the issue to `planned`, log a `kind: docs` change |
   | `do` | claim one ready task with a lease, do it, verify it, log it, refresh `current_state.md`, release the lease; plan first when there is no plan |
   | `log` | append `C-`, `D-` and `L-` entries with `{#id}` anchors (`format.md` section 8) |
   | `handoff` | refresh `current_state.md` and print the bundle, ending with the resume line |
   | `status` | keep the output of `wf-status.sh`: other skills call it by path |
   | `style` | shape titles and one-line entries for lists |

4. **Read the options where they matter.** `then` (add), `max_tasks` (plan), `finish` and `commit` (do), `budget_tokens` and `changes` (handoff), `issue_hours` and `task_hours` (status). The skill of the step says where it reads each. A value the flow does not set is today's behavior. `scripts/wf-env.sh flow origin <step> <option>` says whose value it is: `built-in` (the default), `team` or `me`.
5. **Run the custom steps.** `scripts/wf-env.sh flow custom <step>` lists what runs after `add`, `plan`, `do` or `handoff`, one per line as `<id>|<skill>|<required>|<label>`, in the order to run them. Run a custom step like any step: read its skill (`flow path`), follow it, and put its result where its point says. Each point has one owner and one input:

   | After | Run by, at | Handed to the step |
   |---|---|---|
   | `add` | `adding-work`, step 6: the issues are written and checked | the new issue ids and their paths |
   | `plan` | whoever started the Plan step, once the Plan step's skill is done: you, when asked for a plan; `adding-work` (`then` = `plan`) or `doing-next-step` (no plan yet) otherwise. The Plan step's skill never runs them, so a built-in and a replaced skill act alike | the issue folder |
   | `do` | `doing-next-step`, step 8: after the task's commit, before its log entry (the result goes into the entry's `evidence`) | the issue folder, the task id and the short sha (`git rev-parse --short HEAD`; `none` when `commit` is `none`) |
   | `handoff` | `handing-off`, step 7: the bundle is delivered | the issue folder and the bundle |

   A skill that replaces `adding-work`, `doing-next-step` or `handing-off` may not name its custom steps: run them yourself at that point.
6. **A custom step fails.** If `required` is `true`, stop the run: append a `kind: failure` change (`result: fail`, the reason in `evidence`), add a `Needs you` request to the issue's owner, release what you hold and report it. After `do` the task also goes to `blocked` and no criterion is ticked for it (`doing-next-step` step 8). After `add` the new issues have no `changes.md` or `current_state.md`: write the change to the `changes.md` of the first new issue (create it from `format.md` section 8), name the step in the report instead of a request, and stop before the offer to plan (`adding-work` step 6). If it is `false`, append the same `kind: failure` change, name it in the report and go on. A custom step whose skill is unresolved fails the same way.

## 4. Rules for every write

1. **Read first.** Read `current_state.md` of the issue, then `goal.md`, before you change anything.
2. **Make minimal edits in the contract format.** Change only the lines you must: tick one checkbox, set one key, append one entry. Do not reformat a file or rewrite frontmatter. Exceptions: new files, and `current_state.md`, which you overwrite as a whole.
3. **Use the formats in `references/format.md`.** Copy its templates. Ids, timestamps and handles come from `scripts/wf-env.sh` (`id`, `now`, `later`).
4. **Logs are append-only.** Add entries at the bottom of `changes.md`, `decisions.md` and `learnings.md`. Never edit or delete an old entry.
5. **Evidence over claims.** Tick a task, step or criterion only after you ran its check and saw it pass in this session.
6. **Respect leases.** Do not touch a task or issue that another author holds under a live lease.
7. **Keep it traceable.** Commits for an issue end with the trailer `Issue: <id>`. Change entries name the task and the commit.
8. **Lint your files.** Run `pnpm -s -C web wf:lint <root>` from the wf repository root (or `wf lint`; from another folder use `cd <wf repo>/web && pnpm -s wf:lint <absolute root>`) and fix findings in the files you touched. The script checks the F and S rules only, so the Q rules named in `format.md` (Q008, Q012, Q014) need a manual check.
9. **Stay in the contract.** Do not create files outside section 1 of `references/format.md`, and never write `.wf/`.

## 5. How the dashboard sees your work

`pnpm -C web dev` serves the board from `web/mock/workspace`. A file saved there appears on the board within a second, so each of your edits shows live. A half-written file shows lint findings but never breaks the board, so write whole valid files in one save.

## 6. When the `wf` CLI exists

There is no `wf` binary yet, so the skills edit files. If `command -v wf` finds one, use it for the steps below instead of editing by hand; it writes the same bytes.

| Step | Command |
|---|---|
| create a group or an issue | `wf new group <path>`, `wf new issue <group>/<slug> --title "..."` |
| append a log entry | `wf append <issue> change\|decision\|learning --title "..." --meta k=v` |
| overwrite the state | `wf state <issue> --from <file>` |
| claim, renew, release | `wf next --claim`, `wf claim <issue>#T-n`, `wf heartbeat`, `wf release` |
| set a status, tick | `wf move <issue> <status>`, `wf task <issue>#T-n --status ...`, `wf check <issue> SC-n --evidence "..."` |
| bundle, report, lint | `wf context <issue>`, `wf status`, `wf lint` |

## Example: one flow, four skills

The user says "continue wf-3k9x2". You run `wf-env.sh root` (`web/mock/sample`), read `issues/wf/web/live-board-updates/current_state.md` ("Delta stream runs end to end; lagged-client resync is in flight."), pick `checking-status` to see that T-4 is ready, and `doing-next-step` to claim it. `logging-work` writes the change entry and `handing-off` leaves the next person a bundle.

## Reference

- `references/format.md`: every file format with copyable templates, the ready rule, leases, status transitions.
- Contract: `docs/plan/contract.md` sections 1.2 to 1.7.
