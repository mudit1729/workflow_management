---
updated_at: 2026-08-22T11:00+05:30
updated_by: "@codex"
revision: 1
---

## Approach

Walk the folder once, parse each file with `wf-parse` and build the snapshot in memory. Measure the scan on the golden workspace.

## Phase 1: Scan

### T-1: Walk the folder and apply the ignore rules
- status: done
- lane: core
- owns: `crates/wf-index/src/scan.rs`
- satisfies: SC-2, SC-3
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-index scan_ignores`

Skip the ignored paths. Report a folder with both `goal.md` and `_group.md` as F008.

### T-2: Build the snapshot and benchmark the scan
- status: done
- lane: core
- depends_on: T-1
- owns: `crates/wf-index/src/snapshot.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo bench -p wf-index scan_bench`

Parse the files in parallel and join the results into one snapshot.
