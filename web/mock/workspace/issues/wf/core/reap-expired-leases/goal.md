---
id: wf-q4fs9
title: Reap expired task leases
status: in_progress
priority: medium
size: s
owner: "@mudit"
labels: [lease]
claimed_by: "@codex"
lease_until: 2026-10-22T17:00+05:30
blocked_by: []
created: 2026-10-20T15:10+05:30
---

## Context

A task lease that expires still names its holder, so a task that another agent can take looks claimed for good. The index shows an amber warning (Q004) but never frees the task.

A reaper must free the claim after a grace period and tell the coordinator what it freed.

## Success criteria

- [ ] SC-1: When a task lease has been expired for 15 min, the daemon shall release the claim and set the task to `todo`.
  - verify: `cargo test -p wf-index reap_after_grace`
- [ ] SC-2: While a lease is inside its grace period, the board shall show the lease as expired.
  - verify: manual
- [ ] SC-3: When the daemon reaps a lease, the daemon shall append a change entry that names the former holder.
  - verify: `cargo test -p wf-index reap_appends_change`

## Out of scope

- Reaping the lease of a coordinator. A person decides who takes over an issue.
- Warning an agent before its lease ends.

## Links

- [[wf-3k9x2]]: live updates show a reaped task within 2 s.
- [[wf-b1d7v]]: Build v1.
