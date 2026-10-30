---
name: summarizing-work
description: Use when someone wants the work of a wf workspace summarized into the personal library, such as "summarize this group", "write the issue summaries", "refresh the summary of wf-3k9x2", "this summary is stale" or the dashboard's Summarize this group and Refresh buttons. Reads the issues of a group or one issue and writes or refreshes work/workspace/group/_group.md and work/workspace/group/issue-id.md with a rev that tells when a summary went stale, status-ordered tables and fixed sections, then commits and pushes the library. Avoid for a context bundle that hands an issue over (use handing-off), for status counts and requests (use checking-status), for summarizing code (use summarizing-codebase), and for changing any issue file.
---

# Summarizing work

A work summary is a short page of the personal library about one issue or one group, organised like the group tree: `work/<workspace>/<group>/<sub>/_group.md` for a group and `<issue-id>.md` for an issue. The Work section of the dashboard lists them by group and, inside a group, by status. A summary carries a `rev`; when the issue changes after that, the dashboard shows **Stale · Refresh**, and **Summarize this group** runs this skill. Formats: `docs/plan/proposals/libraries-spec.md` section 3. The workspace is read-only for this skill. Read `../using-wf/SKILL.md` section 1 (find the workspace) and `../keeping-a-library/SKILL.md` section 1 (find the library, pull before you write) first.

## Steps

1. **Find the pieces.** `ROOT` = `../using-wf/scripts/wf-env.sh root`. `$LIB` = `../keeping-a-library/scripts/wf-lib.sh root`, then `git -C "$LIB" pull --ff-only`. `<workspace>` = `../keeping-a-library/scripts/wf-lib.sh slug "$(wf-env.sh config workspace.name)"`. Your handle: `wf-env.sh author`. Time: `wf-env.sh now`. On the sample world set `WF_NOW` as `../using-wf/SKILL.md` says, or its leases read as expired.
2. **Pick the targets.** An issue (id, slug or path): that issue only. A group (a folder under `<issues_dir>`, such as `wf/web`): every issue below it, then the groups below it from the deepest up, then the group. The page of a group is `$LIB/work/<workspace>/<group path>/_group.md` and the page of an issue is `.../<group path>/<issue-id>.md`. An issue outside any group goes to `work/<workspace>/<issue-id>.md`. A folder without `_group.md` is an implicit group: its title is the folder name.
3. **Skip what is current.** `scripts/wf-rev.sh <folder>` prints the rev of an issue folder or a group folder (below). If the page exists and its `rev` is equal, leave it and report "current". Rewrite it anyway only when the person says so.
4. **Read each issue**, in this order: `current_state.md`, `goal.md`, `changes.md`, `decisions.md`, `learnings.md`, `plan.md`. For open requests, expired leases and stale work run `../checking-status/scripts/wf-status.sh --no-git <id>` instead of working them out. Commits and pull requests come from the `commit:` and `pr:` keys of `changes.md`; do not call git or GitHub.
5. **Write the issue page**, then the group pages (formats below). Write whole files: a summary is generated, never hand-edited. Use the workspace words (`glossary.md`): issue, group, entry.
6. **Save.** `git -C "$LIB" add work && git -C "$LIB" commit -m "Summarize <group path>: <n> issues" && git -C "$LIB" push`. For one issue the message is `Summarize <issue-id>`.
7. **Report** one line per page: path, rev and status, or "current". Say when a parent group is now stale because a child changed.

## The rev

The rev is the first 7 hex characters of the SHA-256 of one text stream. For every wf file at or below the folder, in byte order of the path relative to the folder, the stream holds the line `== <relative path>` and then the file's text with its times made neutral: an ISO time with a clock part (`2026-10-22T16:27+05:30`) reads `<time>`, and the date of a `due:`, `created:`, `last_reviewed:` or `review_after:` line reads `<date>`. The wf files are `goal.md`, `plan.md`, `current_state.md`, `changes.md`, `decisions.md`, `learnings.md` and `_group.md`; the folders `notes/` and `evidence/` are not read. An issue folder gives the rev of the issue and a group folder gives the rev of the whole group, so any change below a group makes its page stale. `scripts/wf-rev.sh` is this rule as a command, and it is what the dashboard computes too:

```
cd "$FOLDER" && scripts/wf-rev.sh .
```

A summary is stale when its `rev` differs from the rev of its folder now. A lease renewal or a moved clock changes only times, so it does not change the rev; a new log entry, a ticked criterion or a status change does. Never compute the rev by hand: run the script (`shasum -a 256` stands in for `sha256sum` where there is none).

## An issue page

Frontmatter keys in this order. Quote `rev` (a hash such as `1234567` would read as a number), handles, and a `title` that holds `: `. `status` is the issue's status key (`in_progress`), `group` its group path, `workspace` the name from `workflow.toml`.

```markdown
---
title: Push board updates over SSE
kind: issue-summary
issue: wf-3k9x2
workspace: wf
group: wf/web
status: in_progress
rev: "cd645b4"
summarized_at: 2026-10-22T16:27+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

The delta stream runs end to end; resync for lagged clients is in flight. @codex has claimed T-3. The choice of SSE over WebSocket waits for @shruti (Q-4m2pz), and 2 of 5 criteria are verified.

## Done so far

- Sent `snapshot` on connect · `0d4a6c1` · [[wf-3k9x2#C-2xk8v]]
- Checked the raw-file view for invalid frontmatter · [[wf-3k9x2#C-m7x4c]]

## Decisions

- [[wf-3k9x2#D-7f3k2]] Push board updates over SSE (accepted, replaces [[wf-3k9x2#D-2ab3c]])
- [[wf-3k9x2#D-5mh8q]] Elect one leader tab per browser (proposed)

## Learnings

- [[wf-3k9x2#L-2gk7r]] Rescan the subtree, since notify 8.2 drops rename events on macOS.

## Next

1. @shruti answers Q-4m2pz: keep SSE instead of WebSocket.
2. Finish `resync` for lagged clients in [[wf-3k9x2#T-3]].
```

All five sections, in this order, always. An empty one holds `None.`. No H1.

- **Where it stands:** one to three sentences, present tense. The first is at most 100 characters and stands alone: the group table repeats it. Then who has claimed what (`claimed_by`, never a lease time or an age: they change while the files do not), an open blocking request, and "N of M criteria are verified" (a criterion is verified when it is ticked and has `evidence:`). Say so when an issue is `done` with an open criterion. A backlog or planned issue with no log says what it is for.
- **Done so far:** at most 8 bullets, newest first, from the entries of `changes.md` with `kind` progress, fix, refactor, test or verify and a `result` that is not `fail`. Shape: ``- <entry title> · `<commit>` · [[<issue-id>#<C-id>]]``; leave out the commit when the entry has none; add `· PR #<n>` for a `pr:` key. Docs, research, review, answer and failure entries stay in the log.
- **Decisions:** every decision of `decisions.md` that no other decision supersedes, oldest first: `- [[<issue-id>#<D-id>]] <title> (<status>)`, or `(<status>, replaces [[<issue-id>#<D-old>]])` when it has `supersedes`.
- **Learnings:** every learning, at most 8, oldest first: `- [[<issue-id>#<L-id>]] <title>`.
- **Next:** at most 5 numbered lines: an open blocking request first (`@person answers Q-id: <question in short>`), then the `Next steps` of `current_state.md`, else the next open criterion or the plan. Rewrite `[[#T-3]]` as `[[<issue-id>#T-3]]`: the page lives outside the issue folder.

## A group page

Same frontmatter without `issue` and `status`; `title` is the group's `title` and `rev` is the rev of the group folder.

```markdown
---
title: web
kind: group-summary
workspace: wf
group: wf/web
rev: "f415f1b"
summarized_at: 2026-10-22T16:27+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Give humans a calm, live view of every issue and every open request. 7 issues: 2 in progress, 1 in review, 2 planned, 1 in the backlog and 1 done. An issue is done when it works in the light and the dark theme and a Playwright test covers it.

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Push board updates over SSE](wf-3k9x2.md) | In progress | The delta stream runs end to end; resync for lagged clients is in flight |
| [Drag issues between columns](wf-z9mw2.md) | Review | All drag paths work; @shruti reviews the rollback test |

## Risks

- [[wf-c2pn6]] is done with SC-4 and SC-5 unverified.

## Next

1. Review the rollback test of [[wf-z9mw2]], verify SC-4 and move it to done.
```

Sections in this order: `## Outcome`, `## Groups` (only when the group has subgroups), `## Issues`, `## Risks`, `## Next`.

- **Outcome:** at most 3 sentences: the group's `goal`, the counts by status, and its `definition_of_done` in one sentence.
- **Groups:** a table `Group | Issues | In one line`, one row per subgroup, linking `<sub>/_group.md`, with its issue count and the goal of that group.
- **Issues:** the group's own issues, one table, ordered by status (In progress, Blocked, Review, Planned, Backlog, Done, Cancelled), then by priority (urgent, high, medium, low, none), then by id. The first cell links the issue page by its file name. The status cell is the board's label. The last cell is the first sentence of the issue's Where it stands, without the full stop. A group without issues has `None.`
- **Risks:** facts only, one bullet each, naming the issue: a blocking request and its target, an issue `done` or in `review` with an unverified criterion, an expired lease, stale work, a blocked issue, a due date within 7 days or past, a file the workspace linter rejects. `None.` when there are none.
- **Next:** at most 5 numbered lines, in table order, the action first.

## Red flags

- A page was edited by hand, or the `rev` was not run on the folder you summarized.
- A sentence holds a time, an age or "live lease": the page goes wrong while the rev stays equal.
- A claim has no entry, criterion or key behind it, or a commit hash is not from a `commit:` key.
- Sections are missing, renamed or out of order, or the table is not in status order.
- A workspace file changed. This skill only writes under `work/`.
- A parent group was summarized without its children, or an issue page without its `rev` current.

## Checks for this skill

- Given an unchanged issue, `wf-rev.sh` equals the page's `rev` and nothing is written.
- Given one new entry in `changes.md`, the issue's rev and every parent group's rev change.
- Given the group `wf/web` of the sample, the pages are `work/wf/wf/web/_group.md` and seven `<issue-id>.md` files.
- Given an issue with no log and no state, the five sections exist and the empty ones say `None.`
- Given a `done` issue with an open criterion, Where it stands and the group's Risks say so.
- The Issues table lists In progress before Review before Planned before Backlog before Done.
