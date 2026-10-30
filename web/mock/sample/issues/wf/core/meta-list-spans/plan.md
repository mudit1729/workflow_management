---
updated_at: 2026-10-07T09:40+05:30
updated_by: "@codex"
revision: 1
---

## Approach

Add a `Span` to the meta-list model, fill it in the parser, then test the writer against the spans with a property test.

## Assumptions

- A1: A byte offset is enough; no line and column. [confirmed]

## Prior art

- [[lib-2hq6n]]: splice one value; never re-serialize.

## Phase 1: Spans

### T-1: Add Span to the meta-list model
- status: done
- lane: core
- owns: `crates/wf-model/src/meta.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-parse meta_spans`

Give each meta item a `key_span` and a `value_span` in bytes.

### T-2: Return spans for keys and values
- status: done
- lane: core
- depends_on: T-1
- owns: `crates/wf-parse/src/meta.rs`
- satisfies: SC-1, SC-3
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-parse meta_trailing_comment`

Fill the spans while the parser reads each `- key: value` line. End the value span before a trailing comment.

### T-3: Test the splice with a property test
- status: done
- lane: core
- depends_on: T-2
- owns: `crates/wf-edit/tests/span_splice_prop.rs`
- satisfies: SC-2
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-edit span_splice_prop`

Generate random meta lists. Replace one value and assert that all other bytes match.

### T-4: Benchmark the golden plan
- status: done
- lane: core
- depends_on: T-2
- owns: `crates/wf-parse/benches/meta_bench.rs`
- satisfies: SC-4
- assignee: role:backend
- claimed_by: @mudit
- verify: `cargo bench -p wf-parse meta_bench`

Time the parse of the 400-line `plan.md` fixture.
