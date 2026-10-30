---
id: wf-n7vy3
title: Sync GitHub issues in both directions
status: cancelled
priority: none
size: l
owner: "@mudit"
labels: [integration]
blocked_by: []
created: 2026-09-22T11:00+05:30
---

## Context

Some teams track work in GitHub issues. This issue asked for a sync in both directions, so that a change in one system shows up in the other.

The team cut it from v1. Two systems that both write the same fields need a conflict rule, and the file format has none.

## Success criteria

- [ ] SC-1: When a GitHub issue changes, the daemon shall update the matching wf issue within 1 min.
  - verify: manual
- [ ] SC-2: When a wf issue changes status, the daemon shall update the matching GitHub issue within 1 min.
  - verify: manual

## Out of scope

- Everything. The issue is cancelled and out of scope for v1.

## Links

- [[wf-b1d7v]]: Build v1 lists two-way sync as out of scope.
