---
updated_at: 2026-10-22T09:27+05:30
updated_by: "@codex"
revision: 2
---

## Approach

Count tokens with an estimate, because the CLI cannot call a tokenizer service. Trim in a fixed order and stop at the first fit. Replace each diagram with a stub last, because the stub needs the node count from the archify render.

## Assumptions

- A1: A byte-pair estimate stays within 10% of the Claude tokenizer. [confirmed]
- A2: Agents read the end line that names dropped sections. [open]

## Prior art

- [[lib-6pm4c]]: the bundle is the first thing an agent reads.

## Phase 1: Count tokens

### T-1: Count tokens with a byte-pair estimate
- status: done
- lane: core
- owns: `crates/wf-cli/src/context/tokens.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-cli context_budget`

Estimate tokens from bytes with a 10% safety margin. Read the budget from `workflow.toml`.
- [x] Add the estimator.
- [x] Read `budget_tokens` from `workflow.toml`.

## Phase 2: Trim

### T-2: Drop sections in a fixed order
- status: in_progress
- lane: core
- depends_on: T-1
- owns: `crates/wf-cli/src/context/**`
- satisfies: SC-2, SC-3
- assignee: role:backend
- claimed_by: @codex
- lease_until: 2026-10-22T17:05+05:30
- verify: `cargo test -p wf-cli trim_order`

Drop sections from the end of the order until the bundle fits. Never drop `## Needs you`, `## Next steps` or the open criteria.
- [x] Order the sections by drop priority.
- [x] Stop trimming at the first fit.
- [ ] Test that `## Next steps` survives a 2000 token budget.

### T-3: Name the dropped sections at the end of the bundle
- status: todo
- lane: core
- depends_on: T-2
- owns: `crates/wf-cli/src/context/footer.rs`
- satisfies: SC-4
- assignee: role:backend
- verify: manual

End the bundle with one line, for example `dropped: 6 changes, 2 library items`.

## Phase 3: Expose

### T-4: Replace diagrams with stubs
- status: todo
- lane: core
- depends_on: T-2
- owns: `crates/wf-archify/src/stub.rs`
- satisfies: SC-5
- assignee: role:backend
- verify: `cargo test -p wf-cli diagram_stub`

Print `[diagram <type> "<title>" · <n> nodes · <file>:<line>]` for each archify block. Read the node count from the render receipt.

### T-5: Show the bundle size in the drawer
- status: todo
- lane: web
- depends_on: T-2
- owns: `web/src/features/issue/ContextSize.tsx`
- satisfies: SC-1
- assignee: role:frontend
- verify: manual

Show `4,210 of 6,000 tokens` next to the `Copy wf context` button.
