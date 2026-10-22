---
summary: "Lease state is in the index; the reaper is in flight and the lease on T-3 has expired."
updated_at: 2026-10-22T15:42+05:30
updated_by: "@codex"
phase: Detect and release
session: cx-77c2
---

## Done
- [[#T-1]] The index returns the lease state. See [[#C-4xn8r]].

## In flight
- [[#T-2]] The reaper. @codex holds the lease. The timer and the claim release work.
- [[#T-3]] The card badge. The lease of @claude-sonnet expired 35 min ago.

## Needs you
- [x] Q-9nh2e: Release a lease at expiry, or after a grace period?
  - from: @codex
  - to: @mudit
  - kind: question
  - urgency: blocking
  - asked: 2026-10-22T13:27+05:30
  - options: at expiry, after 15 min
  - answer: after 15 min. Agents often restart in under 10 min.
  - answered_by: @mudit
  - answered_at: 2026-10-22T15:47+05:30

## Handoff notes
- @codex owns `crates/wf-index/src/reap.rs` under the T-2 lease. Do not edit that file.

## Next steps
1. Run `wf resolve wf-q4fs9` to record the answer to [[#Q-9nh2e]].
2. Append the change entry in [[#T-2]].
3. Take over [[#T-3]] with `wf claim wf-q4fs9#T-3 --steal`.
