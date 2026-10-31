---
title: web
kind: group-summary
workspace: wf
group: wf/web
rev: "0c7d9e2"
summarized_at: 2026-10-27T18:40+05:30
summarized_by: "@claude-sonnet"
---

## Outcome

Give humans a calm, live view of every issue and every open request. 7 issues: 3 in progress, 2 planned, 1 in the backlog and 1 done. Done means: the change works in the light theme and in the dark theme; a Playwright test covers the new behavior.

## Issues

| Issue | Status | In one line |
|---|---|---|
| [Push board updates over SSE](wf-3k9x2.md) | In progress | Delta stream runs end to end; lagged-client resync has not started |
| [Drag issues between columns](wf-z9mw2.md) | In progress | Drag works with the mouse; the rollback on a conflict is in flight |
| [Navigate the board by keyboard](wf-h2tb7.md) | In progress | j and k work; h and l still need a rule for empty columns |
| [Fix tab-title count](wf-7yq2m.md) | Planned | The browser tab title shows `(5) wf`, but only 2 requests wait for @shruti |
| [Fix drawer width jump](wf-e6kc1.md) | Planned | The drawer grows by 16 px when a tab with a long list opens, because the scrollbar appears and… |
| [Show group roll-up progress bars](wf-v1cm9.md) | Backlog | The group tree shows a count for each group, but not how far along the group is |
| [Add a command palette](wf-c2pn6.md) | Done | Palette is shipped; two criteria still wait for evidence |

## Risks

- [[wf-3k9x2]] waits for @shruti on Q-4m2pz.
- [[wf-7yq2m]] has 1 error the workspace linter rejects: F001 in `goal.md`.
- [[wf-c2pn6]] is done with SC-4 and SC-5 not verified.

## Next

1. [[wf-3k9x2]]: @shruti answers Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?
2. [[wf-z9mw2]]: Roll the card back when the server answers a conflict.
3. [[wf-h2tb7]]: Skip empty columns when `h` or `l` moves focus.
4. [[wf-7yq2m]]: Plan the issue with `planning-issues`.
5. [[wf-e6kc1]]: Plan the issue with `planning-issues`.
