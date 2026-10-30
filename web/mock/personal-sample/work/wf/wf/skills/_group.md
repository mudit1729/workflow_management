---
title: skills
kind: group-summary
workspace: wf
group: wf/skills
rev: "72dbae7"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Teach agents the file format through skills, hooks and the flowchart. 3 issues: 2 in progress and 1 in review. Done means: `wf skills lint` reports zero findings at warn or above.

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Draw the skills flowchart](wf-skf01.md) | In progress | First draft of the flow is drawn; the node layout waits for your answer |
| [Promote learnings to the library](wf-x5hd3.md) | In progress | Promote and approve both work in the daemon; the dialog is in flight |
| [Resume the issue on session start](wf-p2hs4.md) | Review | Hook prints the bundle; @shruti reviews the timing test |

## Risks

- [[wf-skf01]] waits for @shruti on Q-6vt4c.
- [[wf-p2hs4]] is in review with SC-3 not verified.

## Next

1. [[wf-skf01]]: @shruti answers Q-6vt4c: Group the flowchart nodes by plugin or by phase?
2. [[wf-x5hd3]]: Finish the merge suggestion in [[wf-x5hd3#T-3]].
3. [[wf-p2hs4]]: Verify [[wf-p2hs4#SC-3]] with its command after the review.
