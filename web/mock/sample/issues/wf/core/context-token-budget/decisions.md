# Decisions

## 2026-10-18T17:40+05:30 @codex — Count tokens with an estimate, not a tokenizer crate {#D-4hv9s}
- status: accepted
- topic: token-count
- affects: SC-1
- decided_by: @codex, @mudit

**Decision:** Estimate tokens from byte pairs and add a 10% margin.
**Because:** `wf` stays offline and makes no model call. The estimate is within 4% of the Claude tokenizer and never counts low.
**Rejected:** `tiktoken-rs` (5% high on tables); a call to a token-count API (needs a network and a key).
**Consequences:** Bundles carry about 10% of unused budget.
**Revisit when:** Agents report that bundles end up too short.
