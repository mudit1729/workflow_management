---
id: wf-ss0lo
title: SSO login
status: backlog
priority: medium
size: l
owner: "@mudit"
labels: [auth]
blocked_by: []
created: 2026-10-07T10:20+05:30
---

## Context

The daemon binds to 127.0.0.1 and trusts anyone on the machine. A shared server needs a login. Single sign-on through OIDC lets a team reuse its identity provider.

## Success criteria

- [ ] SC-1: When a user opens the dashboard without a session, the server shall redirect to the identity provider.
  - verify: manual
- [ ] SC-2: When the identity provider returns a valid code, the server shall create a session that lasts 8 h.
  - verify: `cargo test -p wf-server oidc_session`
- [ ] SC-3: If the token is invalid, then the server shall answer 401 and log the reason.
  - verify: `cargo test -p wf-server oidc_invalid_token`

## Out of scope

- Roles and per-group permissions.
- Login by password.

## Links

- [[wf-y4bz7]]: refresh tokens silently.
