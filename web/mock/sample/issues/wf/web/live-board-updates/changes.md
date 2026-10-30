# Changes

## 2026-10-20T17:22+05:30 @claude-opus — Wrote the plan with 5 tasks in 3 lanes {#C-3m8tz}
- kind: docs
- files: `plan.md`
- session: cc-41a9
- model: claude-opus-5-5

Split the work into the `core`, `server` and `web` lanes. Made T-4 independent of the server lane, so web work can start on the mock server.

## 2026-10-20T18:47+05:30 @codex — Compared SSE, WebSocket and polling for the board {#C-5rd9e}
- kind: research
- files: `notes/research.md`

Wrote `notes/research.md`. SSE needs one axum route and replays with `Last-Event-ID`. Polling every 2 s misses the latency target.

## 2026-10-20T23:12+05:30 @codex — Lost the remove event of a renamed folder in notify 9.0-rc {#C-5wq7k}
- kind: failure
- task: T-2
- result: fail
- evidence: `cargo test -p wf-index rename_folder` failed
- files: `crates/wf-index/src/watch.rs`

Ran `rename_folder` on notify 9.0-rc. The watcher reported `Remove(Any)` without the old path, and the index kept `issues/a/` after `mv issues/a issues/b`.

## 2026-10-21T00:25+05:30 @codex — Reverted to notify 8.2 and rescanned the subtree {#C-h6r3n}
- kind: fix
- task: T-2
- result: pass
- commit: a3f9c21
- files: `crates/wf-index/src/watch.rs`, `Cargo.lock`

Pinned notify 8.2. Mapped each event to its nearest existing ancestor and rescanned that subtree. `rename_folder` passes.

## 2026-10-21T10:07+05:30 @codex — Diffed snapshots into deltas {#C-9df2a}
- kind: progress
- task: T-1
- commit: 4c1d7e0
- files: `crates/wf-index/src/delta.rs`

Added `Delta` to `wf-index`. Compared two snapshots by per-file hash and listed the changed issue IDs.

## 2026-10-21T11:42+05:30 @codex — Added the `live_append` test {#C-k4t7b}
- kind: test
- task: T-1
- criteria: SC-1
- result: pass
- files: `crates/wf-index/tests/live_append.rs`

Appended an entry with `wf append` in a temp workspace and asserted a `delta` within 2 s. The delta arrived after 640 ms.

## 2026-10-21T14:17+05:30 @codex — Verified SC-1 with `live_append` {#C-v2n8s}
- kind: verify
- criteria: SC-1
- result: pass
- evidence: `cargo test -p wf-index live_append` passed at `b81f03a`
- commit: b81f03a

Ran `wf verify wf-3k9x2 SC-1`. The command passed and wrote the evidence to `goal.md`.

## 2026-10-21T19:57+05:30 @claude-sonnet — Reviewed echo suppression in `watch.rs` {#C-8yb3m}
- kind: review
- task: T-2
- model: claude-sonnet-5-5

Read the hash check in `watch.rs`. Asked for a test with two writes in one debounce window before the task moves to done.

## 2026-10-22T10:22+05:30 @shruti — Checked the raw-file view for invalid frontmatter {#C-m7x4c}
- kind: verify
- criteria: SC-2
- result: pass
- evidence: screenshot `evidence/sc2.png`
- files: `evidence/sc2.png`

Broke the YAML of `wf-7yq2m` by hand. The drawer showed F001 at line 7 and the raw file with the line highlighted.

## 2026-10-22T13:07+05:30 @claude-opus — Resolved Q-7hd2k on the replay buffer size {#C-q3h9a}
- kind: answer
- model: claude-opus-5-5

**Q:** Keep the SSE ring buffer at 256 events?
**A:** Yes. Measure one laptop sleep before you change it. (@shruti)

## 2026-10-22T15:37+05:30 @codex — Streamed deltas over SSE {#C-7k2q9}
- kind: progress
- task: T-3
- commit: 9f1e2ab
- files: `crates/wf-server/src/sse.rs`

Added `GET /api/events`. The route streams `delta` events from the index broadcast.

## 2026-10-22T15:55+05:30 @codex — Sent `snapshot` on connect {#C-2xk8v}
- kind: progress
- task: T-3
- commit: 0d4a6c1
- files: `crates/wf-server/src/sse.rs`

Sent one `snapshot` event when a client connects without `Last-Event-ID`.
