---
name: doing-next-step
description: Use when someone asks to continue, work on or "do the next step" of a wf issue, or the dashboard's "Do next step" and "Open in Codex" buttons start a run. Plans the issue first when it has no plan.md, then picks the next ready task, claims it with a lease, does the work in the repo, verifies it, ticks the task and its steps only with fresh evidence, logs the change, updates current_state.md and commits with an Issue trailer that names the issue id. Avoid for free-form coding with no issue and for handing work to someone else (use handing-off).
---

# Doing the next step

Headless twin of **Do next step**. One run does one task: claim, work, verify, log, commit, hand over. Read `../using-wf/SKILL.md` (sections 1 and 3: the skills flow) and `../using-wf/references/format.md` (sections 6, 7, 8, 10, 11, 13) before the first write. Read the two options of this step once: `../using-wf/scripts/wf-env.sh flow do finish` (`verify` or `review`, step 8) and `flow do commit` (`task` or `none`, step 7). Their defaults are the behavior described below.

## Steps

1. **Set up.** `../using-wf/scripts/wf-env.sh issue <id|slug|path>` gives the folder (`$ISSUE`). Know your handle (`$WF_AUTHOR` or the `authors.md` entry for your runtime) and `[leases] minutes` (`wf-env.sh config leases.minutes`).
2. **Read.** `current_state.md` first, then `goal.md` and `plan.md`; in `decisions.md` read the accepted decisions. Check `## Needs you`:
   - An unanswered `blocking` request that touches the next task: stop and report it.
   - An answered request (`[x]` with an `answer:`): resolve it first (remove the item, append a `kind: answer` change with the Log step's skill, `wf-env.sh flow log`; built-in `logging-work`).
3. **Choose the task.** Run `../checking-status/scripts/wf-status.sh --ready <id>`. A task is ready when it is `todo`, all `depends_on` are `done`, it has no live lease, and its `owns` do not overlap a live lease anywhere in the workspace. Take the first one in your `authors.md` lanes, else the lowest `T-n`.
   - `blocked_by` in `goal.md` names an issue that is not `done`: report that and stop.
   - Nothing ready: say why (waiting on T-n, a live lease of @x) and stop. Do not invent work.
   - No `plan.md`: the run's first step is planning, not a message to plan first. Run the Plan step's skill (`wf-env.sh flow plan`; built-in `planning-issues`; it writes `plan.md` from the criteria and sets `planned`), then the custom steps after Plan (`wf-env.sh flow custom plan`, the issue folder as input; the Plan step's skill leaves them to you), then continue with its first ready task. This holds for every size: the lease and the log entry need a task. An issue that is `done` or `cancelled`, or that has no criteria, stops here.
   - Resuming: a task `in_progress` whose `claimed_by` is you, or whose lease expired, is yours to continue.
4. **Claim.** Re-read `plan.md` right before the edit. If someone else claimed the task meanwhile, go back to step 3. Then make minimal edits:
   - Task meta list: `status: in_progress`, `claimed_by: @you`, `lease_until: <wf-env.sh later N>`, in the key order of `format.md` section 6.
   - `goal.md`: if no live coordinator lease is held by someone else, set `claimed_by: "@you"` (quoted) and `lease_until:` (both go right after `labels:`, the key order of `format.md` section 4) and, when the status is `backlog` or `planned`, `status: in_progress`. A live lease of another author makes you a worker: claim only the task, never touch the claim or status of `goal.md` and never rewrite `current_state.md` (the coordinator does), and say so in the report and in the change entry.
5. **Do the work.** Edit only inside the task's `owns`. Follow the brief and do one step at a time. Need another path or a human decision: add a `Needs you` request (`format.md` section 7), set the task `blocked` and stop. Renew `lease_until` when less than half of the lease remains.
6. **Verify with fresh evidence.** Run the task's `verify` command now. Read its output. Tick a step `- [ ]` to `- [x]` only after you saw its result (a command output, a diff you read). The task keeps its status and its lease until step 8: the custom steps can still stop it.
   - It failed: do not tick. Log a `kind: failure` change (`result: fail`, the error signature in `evidence`). After 3 failed attempts at the same step, set the task `blocked`, add a `Needs you` request and stop.
7. **Commit the code.** Work in the repository that holds the task's `owns` files (it can differ from the workspace repository) and stage only the files you changed for the task. `git commit -m "<Imperative subject, 72 characters at most>" -m "Issue: <issue id>"`. Other trailers (for example `Co-Authored-By:`) go in the same last paragraph as `Issue:`, one per line, never in a paragraph of their own. Take the short sha with `git rev-parse --short HEAD`. Do not push unless asked. Commit unless the user said not to, and say so when you skip it.
   - `commit` set to `none`: skip this step and the workspace commit of step 11. Leave the changes for a person to commit and put the subject you would have used in the report.
8. **Run the custom steps, then finish the task.**
   - Run the custom steps after Do next step (`wf-env.sh flow custom do`; `../using-wf/SKILL.md` section 3). The work is committed (or left in the tree) and the task lease is still yours. Hand each step the issue folder, the task id and the short sha (`none` when `commit` is `none`), and keep what it returns for the `evidence` of step 9.
   - A required step fails: set the task `blocked` (keep `claimed_by`, delete `lease_until`) and tick no criterion. Log the failure in step 9 (`kind: failure`, `result: fail`, the step in the title), add its `Needs you` request, do steps 10 and 11, and report it. Nothing below in this step happens. An optional step that fails is logged the same way in step 9 and the run goes on.
   - Set the status. `done` when `verify` passed in this session and `finish` is `verify` (the default); then delete the `lease_until` line and keep `claimed_by`. `verify: manual`, a task with no `verify`, or `finish` set to `review` (every task, once its `verify` passed): `review`, keep `claimed_by`, delete `lease_until`, and ask the named person with a `Needs you` request (`kind: approval`, `ref: [[#T-n]]`).
   - Tick criteria. For each `SC-n` in `satisfies`: when every task that satisfies it is `done`, run its own `verify` command; if it passes, change `[ ]` to `[x]` and add two child lines under it: `evidence:` (the command, the result and the short sha, or `none`) and `verified_by: @you`. A `manual` criterion is never ticked by an agent: ask a person.
9. **Log it.** Append a change entry with the Log step's skill (`wf-env.sh flow log`; built-in `logging-work`): past-tense title, `kind` progress, fix or test, `task`, `criteria` (those you ticked), `result`, `evidence` (with the result of each custom step), `commit` (none when `commit` is `none`), `files`. A required custom step that failed makes it a `kind: failure` entry with `result: fail`.
10. **Update `current_state.md`** (overwrite it whole; `format.md` section 7). A worker under another author's live coordinator lease skips this step and step 11's `goal.md` edits. `summary` is one present-tense line. `Done` holds pointers (`[[#T-4]]`, `[[#C-xxxxx]]`), `In flight` the other leases, `Needs you` the open requests, `Next steps` the one next action first (usually the next ready task). Keep the words of the file under 400.
11. **Close the run.**
    - Every task `done` (with `finish` set to `review`: `done` or `review`): set `status: review` in `goal.md` and list the gaps (unverified criteria, manual checks such as "Ask @x to verify SC-4 by hand.") in `Next steps`. A task in `review` waits under `Blocked`, not under `Done`. Never write `done` unless every criterion has evidence and no request is open.
    - Release what you hold when you stop: remove `claimed_by` and `lease_until` from `goal.md` (and from any task you leave `todo`).
    - Commit the workspace files with the same trailer: `git add <$ISSUE>` and `git commit -m "Log <T-n> of <issue id>" -m "Issue: <issue id>"`. Skip this when the workspace is not in the repository you committed the code to, or is ignored, or you were told not to change git state, or `commit` is `none`; then say so.
12. **Check and report.** `pnpm -s -C web wf:lint <root>` and fix findings in your files. Report in 3 lines: the task and its evidence, the commit sha (or that `commit` left it to a person), the next ready task.

## Example

Issue `wf-3k9x2`, author `@claude-sonnet`. `wf-status.sh --ready` prints `wf-3k9x2 T-4 [web] Elect one leader tab over BroadcastChannel`. T-3 (`crates/wf-server/src/sse.rs`) is under @codex's lease, but T-4 owns `web/src/lib/live/leader.ts`, so no overlap. Claim edit in `plan.md`:

```markdown
### T-4: Elect one leader tab over BroadcastChannel
- status: in_progress
- lane: web
- owns: `web/src/lib/live/leader.ts`
- satisfies: SC-4
- assignee: role:frontend
- claimed_by: @claude-sonnet
- lease_until: 2026-10-30T15:05+05:30
- verify: `pnpm -C web test leader`
```

After the work, `pnpm -C web test leader` exits 0. Commit `Elect a leader tab with the Web Locks API` with the trailer `Issue: wf-3k9x2`, sha `4e7a1c2`. The log entry:

```markdown
## 2026-10-30T14:52+05:30 @claude-sonnet — Elected one leader tab over BroadcastChannel {#C-6b3nx}
- kind: progress
- task: T-4
- criteria: SC-4
- result: pass
- evidence: `pnpm -C web test leader` passed at `4e7a1c2`
- commit: 4e7a1c2
- files: `web/src/lib/live/leader.ts`

Added the `wf-live` Web Lock. The leader tab opens the `EventSource` and relays each event over `BroadcastChannel`. The test closes the leader and a second tab takes over.
```

T-4 becomes `done` (the `lease_until` line goes), SC-4 stays open until its `manual` check, `Next steps` item 1 becomes "Ask @shruti to verify SC-4 by hand." and the board moves T-4 to done at once.

## Red flags

- You ticked a step before its check ran.
- A required custom step failed and the task is `done`, or a criterion of it is ticked.
- You edited a file outside `owns` or under another author's live lease.
- The commit has no `Issue:` trailer, or the log has no `commit:` although the work is committed.
- You rewrote a whole file where one line needed to change.
- You marked the issue `done` with an unverified criterion.
- You answered "plan the issue first" instead of planning it.
- A run ends with `claimed_by` or `lease_until` still in `goal.md`, or the board shows a different status than the report.
