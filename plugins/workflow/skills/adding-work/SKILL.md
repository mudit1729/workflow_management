---
name: adding-work
description: Use when someone wants to add work to a wf workspace, such as "add a group of work", "split this outcome into issues", "new issue", "break this down for the board" or the dashboard's "+ Add work" button, and the result must be new backlog issues on the board. Orchestrator. Splits an outcome into 3 to 6 issues with one EARS criterion each, shows the split for confirmation when a person is present, then writes _group.md and goal.md files. Avoid for planning an existing issue (use planning-issues), for logging progress, and for editing an issue that already exists.
---

# Adding work

Orchestrator. It is the headless twin of **+ Add work** in the dashboard: the same questions, the same files. It may call `writing-readable-bulk-text` for the titles and `planning-issues` afterwards. It never calls another orchestrator.

Read `../using-wf/SKILL.md` section 1 (find the workspace, your author handle) and the templates in `../using-wf/references/format.md` (sections 2, 4, 5 and the writing rules of section 12) first.

## Steps

1. **Read the workspace.** `../using-wf/scripts/wf-env.sh root` (outside the workspace folder, set `WF_ROOT` first, or the script falls back to the prototype workspace). List the groups: `find <root>/<issues_dir> -name _group.md` and read each `title`, `goal`, `owner`. A folder under `<issues_dir>` that holds issues but has no `_group.md` is an implicit group (for example `docs`): list the folders too, `find <root>/<issues_dir> -maxdepth 2 -type d`, and do not reuse its slug. Read `glossary.md` for the words to use.
2. **Collect the request.** Ask for what is missing, one question at a time, and offer 2 to 4 numbered choices before free text. Skip every question the request already answers.
   - **Outcome** (one sentence; the only answer you may need to type): what is true when the work is done.
   - **Where**: an existing group (offer the titles), or a new group under a parent or at the top level of `<issues_dir>`.
   - **Size** of the whole: xs, s, m, l (default m). **Priority**: urgent, high, medium, low, none (default medium).
   - **Context** (optional): library items, glossary terms or files worth linking under `## Links`.
   - **One issue or a group of work?** One issue skips the split (go to step 5 with one entry).
   - Nobody to ask (for example `codex exec`)? Infer every answer from the request and the workspace, and write what you inferred into the `## Context` of each issue. The requester is the human who asked, not you: take `[server] author` from `workflow.toml` (`wf-env.sh config server.author`, write it as `@name`), else the owner of the group.
3. **Split the outcome into 3 to 6 issues.**
   - Each issue has one deliverable that someone can check alone. Fewer than 3 means it is one issue; more than 6 means group it deeper or split into two groups.
   - Give each issue exactly one EARS criterion (`format.md` section 4) with a measurable response and a `verify:` command or `manual`. Keep the criterion to 25 words or fewer: the linter counts it as a sentence (S01). The `verify:` command runs from the repository root.
   - Give each a size (xs, s, m, l) and a priority. An `l` issue is split again.
   - Order them so that dependencies come first. Set `blocked_by: [<issue id>]` only for a hard dependency.
   - Write the titles with `writing-readable-bulk-text`: collect all of them, then use one shape (imperative verb first, the distinguishing words early). Use the glossary's words (issue, group).
4. **Confirm.** If a person is present, show a table and wait for "all", "drop 2" or an edit:

   | # | Title | Size | Priority | Criterion |
   |---|---|---|---|---|

   Do not write any file before the answer. If nobody can answer, continue.
5. **Write the files.** Use `../using-wf/scripts/wf-env.sh` for ids and the time.
   - New group: `id group`, folder `<issues_dir>/<parent path>/<slug>/` (no parent path at the top level), file `_group.md` (`format.md` section 5): `title` the name as the requester wrote it, `slug` its kebab-case form; `color` the lowest unused 1 to 8 among siblings, `order` the highest sibling `order` plus 1, `owner` the requester, `goal` one line.
   - Each issue: `id issue`, folder `<group folder>/<slug>/`, file `goal.md` (`format.md` section 4). `status: backlog`, `created: <now>`, `owner` the requester or the group owner, `labels` from the request. `## Context` holds the why in 1 or 2 short paragraphs. Add `## Out of scope` and `## Links` only when you have content.
   - Create new files only. Do not touch other issues and do not create `plan.md`, `current_state.md` or the logs.
6. **Check.** `pnpm -s -C web wf:lint <root>`. Fix findings in the files you wrote (max 3 rounds). The board shows the new cards at once.
7. **Report.** Print each new id, title and path, one line each. Offer `planning-issues` for the first issue.

## Example

Request: "Add work: teach agents the wf file format through skills." Group: new `skills` under `wf`. Proposed split (the sample's `wf/skills` group):

| # | Title | Size | Priority | Criterion |
|---|---|---|---|---|
| 1 | Draw the skills flowchart | s | medium | The flowchart shall show every skill of the `workflow`, `library` and `agent-execution` plugins. |
| 2 | Resume the issue on session start | s | medium | When a session starts on a branch named `wf-<id>/…`, the hook shall print the context bundle of that issue. |
| 3 | Promote learnings to the library | m | medium | When a user promotes a learning, the daemon shall create a draft library item with a `source:` backlink to the entry. |

Files written (ids are the sample's; make your own):

```
issues/wf/skills/_group.md
issues/wf/skills/draw-the-skills-flowchart/goal.md
issues/wf/skills/resume-on-session-start/goal.md
issues/wf/skills/promote-learnings/goal.md
```

```markdown
---
id: g-skl01
title: skills
goal: Teach agents the file format through skills, hooks and the flowchart.
owner: "@shruti"
color: 3
order: 3
---
```

```markdown
---
id: wf-p2hs4
title: Resume the issue on session start
status: backlog
priority: medium
size: s
owner: "@shruti"
labels: [hooks]
blocked_by: []
created: 2026-10-30T14:05+05:30
---

## Context

A fresh agent session starts with no memory of the issue. The `SessionStart` hook loads the context bundle, so the agent resumes where the last session stopped.

## Success criteria

- [ ] SC-1: When a session starts on a branch named `wf-<id>/…`, the hook shall print the context bundle of that issue.
  - verify: `bash plugins/agent-execution/hooks/test_session_start.sh`
```

## Red flags

- You wrote a file before the person confirmed the split.
- Two titles start with the same words, or the verbs differ in tense.
- A criterion says "fast", "easy" or "should", or any sentence of a `## Context` holds a hedge word ("may", "might", "probably") or runs past 25 words.
- An id came from memory or from the sample instead of `wf-env.sh id`.
- You also wrote `plan.md` or `current_state.md`: that is `planning-issues`.
