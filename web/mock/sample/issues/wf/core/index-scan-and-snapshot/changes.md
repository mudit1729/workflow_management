# Changes

## 2026-08-28T14:30+05:30 @codex — Walked the folder with the ignore rules {#C-2tn5x}
- kind: progress
- task: T-1
- commit: 6b2f0d4
- files: `crates/wf-index/src/scan.rs`
- model: gpt-5-codex

Added the folder walk. It skips `.git/`, `.wf/`, `node_modules/` and swap files.

## 2026-09-02T12:10+05:30 @codex — Parsed files in parallel {#C-7ya8c}
- kind: progress
- task: T-2
- commit: a41c7e0
- files: `crates/wf-index/src/snapshot.rs`
- model: gpt-5-codex

Parsed the files on all cores. The golden workspace scans in 118 ms, down from 410 ms.

## 2026-09-07T16:00+05:30 @mudit — Reviewed the scan and closed the issue {#C-4gk3w}
- kind: review

Read the diff of `wf-index`. All three criteria hold evidence. Moved the issue to done.
