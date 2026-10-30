---
summary: "Token counting is done; the trim order is in flight."
updated_at: 2026-10-22T15:32+05:30
updated_by: "@codex"
phase: Trim
library_refs: [lib-6pm4c]
session: cx-31ab
---

## Done
- [[#T-1]] The estimator counts within 10%. See [[#C-7pw3d]].
- [[#SC-1]] has evidence from `wf verify`. See [[#C-3mf7q]].

## In flight
- [[#T-2]] The trim order. @codex holds the lease. Sections drop in order and stop at the first fit. The `## Next steps` test remains.

## Blocked
- [[#T-4]] waits for the node count from the archify render. See [[wf-w8vz4]].

## Failed attempts
- `tiktoken-rs` counted 5% above the Claude tokenizer: `bundle 6290 > budget 6000`. Switched to a byte-pair estimate with a 10% margin. See [[#C-2ys8h]].

## Handoff notes
- @codex owns `crates/wf-cli/src/context/` under the T-2 lease. Do not edit those files.

## Next steps
1. Add the `## Next steps` test to [[#T-2]].
2. Claim [[#T-3]] after [[#T-2]] lands.
3. Verify [[#SC-2]] with its command.
