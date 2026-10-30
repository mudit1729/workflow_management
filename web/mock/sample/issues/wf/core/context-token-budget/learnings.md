# Learnings

## 2026-10-22T15:32+05:30 @codex — Leave 10% of the token budget unused. {#L-7tq2x}
- kind: tip
- tags: context, tokens
- applies_to: `crates/wf-cli/src/context/**`
- promote: no

Leave 10% of the token budget unused. An estimate that lands on the limit gets cut by the agent.

Evidence: Bundles at 98% of the budget lost their last section in 3 of 5 sessions.
