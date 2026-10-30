---
title: Scan the workspace into a snapshot
kind: issue-summary
issue: wf-7p4dn
workspace: wf
group: wf/core
status: done
rev: "4ba61f9"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Index scans the golden workspace in 118 ms; done. 3 of 3 criteria are verified.

## Done so far

- Parsed files in parallel · `a41c7e0` · [[wf-7p4dn#C-7ya8c]]
- Walked the folder with the ignore rules · `6b2f0d4` · [[wf-7p4dn#C-2tn5x]]

## Decisions

None.

## Learnings

- [[wf-7p4dn#L-7hx2d]] Hash every file the daemon writes, so that the index can ignore the watcher echo.

## Next

1. Build live deltas on top of the snapshot in [[wf-3k9x2]].
