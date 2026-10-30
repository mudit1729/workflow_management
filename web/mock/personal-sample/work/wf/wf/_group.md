---
title: wf
kind: group-summary
workspace: wf
group: wf
rev: "d41f6b0"
summarized_at: 2026-10-27T18:40+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Build wf v1 and track the build in wf itself. 21 issues: 8 in progress, 1 blocked, 2 in review, 4 planned, 1 in the backlog, 4 done and 1 cancelled. Done means: every criterion has evidence from `wf verify` or a named human check; the change has a `current_state.md` handoff with Next steps.

## Groups

| Group | Issues | In one line |
|---|---|---|
| [core](core/_group.md) | 8 | Parse, index, lint and write the files safely |
| [web](web/_group.md) | 7 | Give humans a calm, live view of every issue and every open request |
| [skills](skills/_group.md) | 3 | Teach agents the file format through skills, hooks and the flowchart |

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Build v1](wf-b1d7v.md) | In progress | Format, index and write protocol are done; the context bundle and the board are in flight |
| [Cut the v0.1 release](wf-g5rx8.md) | Planned | Release flow diagram fails to render and needs a fix before the CI work starts; planned |
| [Sync GitHub issues in both directions](wf-n7vy3.md) | Cancelled | Some teams track work in GitHub issues |

## Risks

- [[wf-g5rx8]] has 1 error the workspace linter rejects: F011 in `plan.md`.

## Next

1. [[wf-b1d7v]]: Land [[wf-t3jp5]] so that SC-5 gets evidence.
2. [[wf-g5rx8]]: Fix the archify errors of the release flow in `plan.md`.
