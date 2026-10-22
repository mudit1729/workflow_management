---
updated_at: 2026-10-20T11:30+05:30
updated_by: "@codex"
revision: 2
---

## Approach

Serve the snapshot first and put the renders in a queue. Run at most 2 renders at a time and send a `diagram` event after each one. Time out a render after 90 s.

## Assumptions

- A1: The `diagram` event needs a height hint to stop layout jumps. [open]

## Phase 1: Queue and events

### T-1: Queue renders behind the first snapshot
- status: done
- lane: server
- owns: `crates/wf-archify/src/queue.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-server snapshot_before_render`

Scan the workspace, serve the snapshot and push each block into a queue.

### T-2: Send a diagram event when a render ends
- status: blocked
- lane: server
- depends_on: T-1
- owns: `crates/wf-server/src/diagram_event.rs`
- satisfies: SC-2
- assignee: role:backend
- verify: `cargo test -p wf-server diagram_event`

Send `{hash, status, errors}` and a height hint. The hint depends on the size contract of [[wf-r6jk2]].

### T-3: Limit renders to 2 at the same time
- status: todo
- lane: server
- depends_on: T-2
- owns: `crates/wf-archify/src/pool.rs`
- satisfies: SC-3
- assignee: role:backend
- verify: `cargo test -p wf-archify concurrency_limit`

Use a semaphore with 2 permits. Read the limit from `[archify] concurrency`.

### T-4: Time out a render after 90 s
- status: todo
- lane: server
- depends_on: T-3
- owns: `crates/wf-archify/src/timeout.rs`
- satisfies: SC-4
- assignee: role:backend
- verify: `cargo test -p wf-archify render_timeout`

Kill the `node` process after `timeout_s`. Mark the diagram `invalid` with a timeout error.
