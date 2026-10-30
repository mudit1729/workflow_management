---
id: wf-7p4dn
title: Scan the workspace into a snapshot
status: done
priority: high
size: m
owner: "@mudit"
labels: [index]
claimed_by: "@codex"
blocked_by: []
created: 2026-08-21T10:00+05:30
---

## Context

Every view of wf starts from one snapshot of the workspace. The index scans the folder, parses each file and builds the groups, the issues and their signals. The snapshot is the base for the board, the CLI and the live deltas.

## Success criteria

- [x] SC-1: When the daemon starts, the index shall scan the 40-issue golden workspace in under 300 ms.
  - verify: `cargo bench -p wf-index scan_bench`
  - evidence: `cargo bench -p wf-index scan_bench` scanned it in 118 ms at `a41c7e0`
  - verified_by: @mudit
- [x] SC-2: The index shall ignore `.git/`, `.wf/`, `node_modules/` and editor swap files.
  - verify: `cargo test -p wf-index scan_ignores`
  - evidence: `cargo test -p wf-index scan_ignores` passed at `a41c7e0`
  - verified_by: @codex
- [x] SC-3: If a folder holds both `goal.md` and `_group.md`, then the index shall report F008.
  - verify: `cargo test -p wf-index f008_both_files`
  - evidence: `cargo test -p wf-index f008_both_files` passed at `a41c7e0`
  - verified_by: @codex

## Links

- [[wf-3k9x2]]: live updates build deltas on top of this snapshot.
