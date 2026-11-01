---
name: checking-status
description: Use when someone asks where wf work stands, such as "what is the status", "what needs me", "what is stale", "which tasks are ready", "show the open requests", or "has wf-3k9x2 got a PR and green CI". Prints a terminal report across all issues or for one issue with status counts, needs-you requests, expired leases, stale work, ready tasks and, when git and gh are available, the commits, pull requests and CI runs that mention the issue id. Read-only. Avoid for changing anything (use doing-next-step or logging-work) and for a full context bundle (use handing-off).
---

# Checking status

A read-only report. `scripts/wf-status.sh` (relative to this file) reads the markdown of the workspace and, for one issue, asks git and gh. The dashboard shows the same facts; this is the terminal view for people and agents without the UI. Format background: `../using-wf/references/format.md` sections 6, 7 and 11. This is the Status step of the skills flow (`../using-wf/SKILL.md` section 3): a team may name another skill for it, but `scripts/wf-status.sh` stays, because other skills call it by path.

## Steps

1. **Run it.**
   - Whole workspace: `scripts/wf-status.sh`
   - One issue (id, slug or path): `scripts/wf-status.sh wf-3k9x2`
   - Ready tasks only, one per line: `scripts/wf-status.sh --ready [issue]`
   - Without git and gh: add `--no-git`. Another workspace: `--root DIR` or `WF_ROOT=DIR`. Code committed in a different repository than the workspace: `--repo DIR` or `WF_REPO=DIR`, or the commit section says it skipped the workspace folder.
2. **Read the sections.**

   | Section | Meaning | Source |
   |---|---|---|
   | Issues | count per status | `status:` of every `goal.md` |
   | Needs you | open requests, blocking first; `[answered]` marks one a human answered that nobody resolved | `## Needs you` of `current_state.md` |
   | Leases expired | a `claimed_by` whose `lease_until` is in the past, for a task or a coordinator | `plan.md`, `goal.md` |
   | Stale | an `in_progress` task with no change entry or lease renewal within `task_hours`; an `in_progress` issue with no change or state update within `issue_hours` (the Status step's options, 4 and 24 by default; `../using-wf/scripts/wf-env.sh flow status task_hours`, `flow status issue_hours`; the script reads them from `[staleness]`) | `changes.md`, `current_state.md` |
   | Ready tasks | `todo` in a `planned` or `in_progress` issue, dependencies `done`, no live lease, `owns` free of live leases | `plan.md` |
   | Git, pull requests and CI | commits that mention the id (`git log --grep`), PRs (`gh pr list --search`), CI runs of those commits or of a branch named after the id (`gh run list`) | git, gh |

3. **Handle missing sources.** The script names every source it skips (no git repository, no `gh`, not signed in, no network) and keeps going. Repeat that reason in your answer. Never guess a PR or CI result.
4. **Answer the question asked.** Lead with the facts that need action: blocking requests, expired leases, then ready tasks. One line each, with the id and the next action:
   - a blocking request: who must answer it;
   - an expired lease or a stale task: take it over with the Do next step's skill (`wf-env.sh flow do`; built-in `doing-next-step`; say so in the change entry), or ask the holder;
   - a ready task: the Do next step's skill.
5. **Recompute by hand only if the script is missing:**
   - counts: `grep -rh --include=goal.md '^status:' <issues> | sort | uniq -c`
   - requests: `grep -rn --include=current_state.md '^- \[ \] Q-' <issues>`
   - leases: `grep -rn --include=plan.md --include=goal.md '^\(- \)\?lease_until:' <issues>` and compare with `wf-env.sh now`
   - git: `git log --all --grep "<id>" --oneline`, `gh pr list --search "<id>" --state all`, `gh run list --branch <branch>`

## Example

```
$ scripts/wf-status.sh wf-3k9x2
wf status · issues/wf/web/live-board-updates · 2026-10-30T08:50+00:00
wf-3k9x2 Push board updates over SSE · in_progress · high · m · owner @shruti · coordinator @claude-opus (lease expired 7d 21h ago)
path: issues/wf/web/live-board-updates
Criteria: 3 of 5 ticked, 2 with evidence · Tasks: 1 of 5 done (1 in progress, 1 review, 0 blocked, 2 todo, 1 ready)
Now: Delta stream runs end to end; lagged-client resync is in flight. (updated 7d 22h ago by @claude-opus)
Next: Finish `resync` for lagged clients in [[#T-3]].
Last change: 2026-10-22T15:55+05:30 @codex — Sent `snapshot` on connect {#C-2xk8v}
Needs you (1)
  blocking wf-3k9x2 Q-4m2pz  @claude-opus -> @shruti  Approve keeping SSE instead of WebSocket for the board?
Leases expired (2)
  wf-3k9x2 (coordinator) @claude-opus expired 7d 21h ago (2026-10-22T17:02+05:30)
  wf-3k9x2 T-3 @codex expired 7d 21h ago (2026-10-22T17:07+05:30)
Stale (2)
  wf-3k9x2 T-3 in_progress: no change entry or lease renewal for 7d 22h (limit 4h)
  wf-3k9x2 issue in_progress: no change entry or state update for 7d 22h (limit 24h)
Ready tasks (1)
  wf-3k9x2 T-4 [web] Elect one leader tab over BroadcastChannel
Git, pull requests and CI for wf-3k9x2
  commits: none mention wf-3k9x2 (add the trailer 'Issue: wf-3k9x2' to commits)
  pull requests and CI: skipped, gh is not signed in or has no network
```

Your answer: "wf-3k9x2 waits on Q-4m2pz (blocking, @shruti). T-3 and the coordinator lease expired 7 days ago; T-4 is ready. No commit mentions the id, and GitHub was unreachable, so PR and CI are unknown."

## Red flags

- You reported a PR or a CI result that the script did not print.
- You skipped the reason for a missing git or gh source.
- You changed a file: this skill is read-only.
- You treated an expired lease as free without logging the takeover.
