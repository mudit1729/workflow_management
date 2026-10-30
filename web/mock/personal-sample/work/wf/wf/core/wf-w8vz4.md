---
title: Stream archify renders in the background
kind: issue-summary
issue: wf-w8vz4
workspace: wf
group: wf/core
status: blocked
rev: "c319786"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Diagram event is blocked on the size contract from the embed research. The issue is blocked by [[wf-r6jk2]]. 0 of 4 criteria are verified.

## Done so far

- Queued renders behind the first snapshot · `47d1b9e` · [[wf-w8vz4#C-6rt5m]]

## Decisions

- [[wf-w8vz4#D-7wc4x]] Limit archify to 2 parallel renders (accepted)

## Learnings

None.

## Next

1. Read the findings of [[wf-r6jk2]] when it moves to review.
2. Unblock [[wf-w8vz4#T-2]] and send the event with a height hint.
3. Claim [[wf-w8vz4#T-3]] after [[wf-w8vz4#T-2]] lands.
