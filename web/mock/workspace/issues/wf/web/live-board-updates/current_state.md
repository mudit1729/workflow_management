---
summary: "The delta stream runs end to end; lagged-client resync is in flight."
updated_at: 2026-10-22T16:02+05:30
updated_by: "@claude-opus"
phase: Live transport
library_refs: [lib-4tz7c]
session: cc-7d2e
---

## Done
- [[#T-1]] Snapshot diff into deltas. See [[#C-9df2a]].
- [[#SC-1]] has evidence from `wf verify`. See [[#C-v2n8s]].
- [[#SC-2]] checked by @shruti with `evidence/sc2.png`. See [[#C-m7x4c]].

## In flight
- [[#T-3]] SSE delta stream. @codex holds the lease. The route and `snapshot` on connect work. `resync` for lagged clients remains.
- [[#T-2]] Echo suppression waits for a review by @claude-sonnet.

## Blocked
- [[#T-5]] waits for [[#T-3]] and [[#T-4]].

## Needs you
- [ ] Q-4m2pz: Approve keeping SSE instead of WebSocket for the board?
  - from: @claude-opus
  - to: @shruti
  - kind: approval
  - urgency: blocking
  - asked: 2026-10-22T15:39+05:30
  - options: approve, reject
  - ref: [[#D-7f3k2]]
  - answer:

## Failed attempts
- notify 9.0-rc: `Remove(Any)` lost on rename. Reverted to 8.2. See [[#C-5wq7k]].

## Handoff notes
- @codex owns `crates/wf-server/src/sse.rs` under the T-3 lease. Do not edit that file.
- The mock server in `web/mock/` plays a scripted event loop every 20 s and the web lane can build T-4 and T-5 against it without waiting for T-3 to land on main.

## Next steps
1. Finish `resync` for lagged clients in [[#T-3]].
2. Claim [[#T-4]] once [[#T-3]] lands.
3. Run `wf verify wf-3k9x2 SC-3`.
