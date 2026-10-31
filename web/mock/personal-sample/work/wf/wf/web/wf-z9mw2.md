---
title: Drag issues between columns
kind: issue-summary
issue: wf-z9mw2
workspace: wf
group: wf/web
status: in_progress
rev: "9a40c33"
summarized_at: 2026-10-27T11:05+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Drag works with the mouse; the rollback on a conflict is in flight. 2 of 4 criteria are verified.

## Done so far

- Checked the column highlight · [[wf-z9mw2#C-6cp5k]]
- Added drop targets and the accent line · `e92b4d7` · [[wf-z9mw2#C-2rw9x]]
- Made the cards draggable · `30c9ba1` · [[wf-z9mw2#C-7nh3b]]

## Decisions

None.

## Learnings

None.

## Next

1. Roll the card back when the server answers a conflict.
2. Ask @shruti for a review of the rollback test.
