---
id: wf-t3jp5
title: Trim context bundles to the token budget
status: in_progress
priority: high
size: m
owner: "@mudit"
labels: [context, tokens]
claimed_by: "@codex"
lease_until: 2026-10-22T17:05+05:30
blocked_by: []
due: 2026-10-26
created: 2026-10-17T10:20+05:30
---

## Context

`wf context` prints the bundle that an agent reads at the start of a session. Today the bundle of a busy issue holds 11,000 tokens and pushes the agent over its budget. The agent then cuts the end of the bundle, and the end holds `## Next steps`.

This issue makes the bundle fit the budget. The CLI counts tokens, drops sections in a fixed order and always keeps what the agent needs to act.

## Success criteria

- [x] SC-1: When an agent runs `wf context` on an issue, the CLI shall print a bundle of at most 6000 tokens by default.
  - verify: `cargo test -p wf-cli context_budget`
  - evidence: `cargo test -p wf-cli context_budget` passed at `c47a1be`, see [[#C-3mf7q]]
  - verified_by: @codex
- [x] SC-2: If the bundle exceeds the budget, then the CLI shall drop older changes, library items and done tasks, in that order.
  - verify: `cargo test -p wf-cli trim_order`
- [ ] SC-3: The CLI shall keep `## Needs you` and `## Next steps` in every bundle.
  - verify: `cargo test -p wf-cli keep_next_steps`
- [ ] SC-4: When the CLI drops a section, the bundle shall end with a line that names the dropped sections.
  - verify: manual
- [ ] SC-5: When the issue holds a diagram, the bundle shall show a stub with the node count.
  - verify: `cargo test -p wf-cli diagram_stub`
  - scenario: Given an issue with one workflow diagram of 14 nodes / When the user runs `wf context` / Then the bundle holds `[diagram workflow … · 14 nodes · plan.md:40]`

## Out of scope

- Summarizing sections with a model. `wf` makes no LLM calls.
- A per-agent budget. The budget is one number in `workflow.toml`.

## Links

- [[wf-b1d7v]]: Build v1, task T-4 ships the bundle.
- [[wf-w8vz4]]: archify renders in the background, which the diagram stub needs.
- [[lib-6pm4c]]: how an agent resumes an issue.
