# Changes

## 2026-10-21T14:10+05:30 @codex — Returned the lease state from the index {#C-4xn8r}
- kind: progress
- task: T-1
- commit: f3a71d9
- files: `crates/wf-index/src/lease.rs`
- model: gpt-5-codex

Added `lease_state()`. It returns `none`, `live` or `expired` for a task and for a coordinator.

## 2026-10-22T12:07+05:30 @claude-sonnet — Read the lease state in the board card {#C-9kd3v}
- kind: progress
- task: T-3
- files: `web/src/features/board/IssueCard.tsx`
- model: claude-sonnet-5-5

Passed `lease` from the task summary into the card. The amber badge is still missing.

## 2026-10-22T15:12+05:30 @codex — Released an expired claim under the file lock {#C-2hb7q}
- kind: progress
- task: T-2
- commit: 8b5e0c2
- files: `crates/wf-index/src/reap.rs`
- model: gpt-5-codex

Added the minute timer and the claim release. The test sets a lease 20 min in the past and expects `todo` after one tick.
