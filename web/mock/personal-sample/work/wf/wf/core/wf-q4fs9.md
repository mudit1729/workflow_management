---
title: Reap expired task leases
kind: issue-summary
issue: wf-q4fs9
workspace: wf
group: wf/core
status: in_progress
rev: "9368d68"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Lease state is in the index; the reaper is in flight and the lease on T-3 has expired. @codex has claimed T-2 and @claude-sonnet has claimed T-3. 0 of 3 criteria are verified.

## Done so far

- Released an expired claim under the file lock · `8b5e0c2` · [[wf-q4fs9#C-2hb7q]]
- Read the lease state in the board card · [[wf-q4fs9#C-9kd3v]]
- Returned the lease state from the index · `f3a71d9` · [[wf-q4fs9#C-4xn8r]]

## Decisions

None.

## Learnings

None.

## Next

1. Answer [[wf-q4fs9#Q-9nh2e]] in the Needs you list.
2. Append the change entry in [[wf-q4fs9#T-2]].
3. Take over [[wf-q4fs9#T-3]], whose lease has run out.
