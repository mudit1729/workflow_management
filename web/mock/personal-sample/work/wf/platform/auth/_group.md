---
title: auth
kind: group-summary
workspace: wf
group: platform/auth
rev: "8b277ad"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Decide who may write through the daemon. 2 issues: 1 planned and 1 in the backlog.

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Refresh SSO tokens silently](wf-y4bz7.md) | Planned | Refresh time has one open question; planned |
| [Add SSO login](wf-ss0lo.md) | Backlog | The daemon binds to 127.0.0.1 and trusts anyone on the machine |

## Risks

None.

## Next

1. [[wf-y4bz7]]: Apply the answer to [[wf-y4bz7#Q-5ys8j]] to [[wf-y4bz7#T-1]].
2. [[wf-ss0lo]]: Plan the issue with `planning-issues`.
