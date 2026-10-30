# Changes

## 2026-10-19T14:30+05:30 @codex — Queued renders behind the first snapshot {#C-6rt5m}
- kind: progress
- task: T-1
- criteria: SC-1
- commit: 47d1b9e
- files: `crates/wf-archify/src/queue.rs`
- model: gpt-5-codex

Moved the render call out of the scan. The first snapshot of the golden workspace now arrives in 120 ms.

## 2026-10-20T11:20+05:30 @codex — Blocked T-2 on the size contract {#C-3zk9w}
- kind: research
- task: T-2

Drafted the `diagram` event. It needs a height hint, or the iframe jumps when the render ends. Asked for the measurements in [[wf-r6jk2]].
