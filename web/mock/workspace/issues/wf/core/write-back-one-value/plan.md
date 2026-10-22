---
updated_at: 2026-08-02T11:00+05:30
updated_by: "@codex"
revision: 1
---

## Approach

Parse the frontmatter with byte spans. Replace the bytes of one value and write the file through a temp file and a rename.

## Phase 1: Splice

### T-1: Splice one frontmatter value
- status: done
- lane: core
- owns: `crates/wf-edit/src/splice.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-edit splice_status`

Find the span of the value. Replace the bytes inside it and keep all other bytes.

### T-2: Check the rev and write atomically
- status: done
- lane: core
- depends_on: T-1
- owns: `crates/wf-edit/src/write.rs`
- satisfies: SC-2, SC-3
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-edit atomic_write`

Hold the lock, compare the `base_rev`, write `.wf-tmp-*` and rename it.
