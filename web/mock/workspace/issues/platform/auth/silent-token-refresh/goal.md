---
id: wf-y4bz7
title: Refresh SSO tokens silently
status: planned
priority: low
size: m
owner: "@mudit"
labels: [auth]
claimed_by: "@claude-opus"
blocked_by: []
due: 2026-10-19
created: 2026-10-08T14:00+05:30
---

## Context

A session ends when the access token expires, and the user then lands on the login page in the middle of work. The browser must refresh the token in the background, so that a working session never ends by surprise.

## Success criteria

- [ ] SC-1: When the access token has 5 min left, the browser shall request a new token in the background.
  - verify: `pnpm -C web test token-refresh`
- [ ] SC-2: If the refresh fails twice, then the browser shall show the login page.
  - verify: `pnpm -C web test token-refresh-fail`
- [ ] SC-3: While a refresh runs, the browser shall queue other API calls.
  - verify: `pnpm -C web test token-queue`

## Out of scope

- Refresh tokens for the CLI. The CLI reads a long-lived key.

## Links

- [[wf-ss0lo]]: SSO login.
