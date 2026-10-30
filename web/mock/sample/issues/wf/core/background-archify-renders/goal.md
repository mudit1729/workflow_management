---
id: wf-w8vz4
title: Stream archify renders in the background
status: blocked
priority: medium
size: m
owner: "@mudit"
labels: [archify, performance]
claimed_by: "@codex"
blocked_by: [wf-r6jk2]
created: 2026-10-13T13:00+05:30
---

## Context

Archify takes 3 to 8 s to render one diagram. Today `wf serve` renders every block during the scan. The first snapshot waits for all of them, and the board stays empty for up to 40 s.

The server must answer the snapshot at once, render the diagrams in the background and push a `diagram` event when each render ends.

## Success criteria

- [x] SC-1: When the daemon starts, the server shall answer `GET /api/snapshot` within 500 ms, before any diagram renders.
  - verify: `cargo test -p wf-server snapshot_before_render`
- [ ] SC-2: When a render ends, the server shall send a `diagram` event with the new status.
  - verify: `cargo test -p wf-server diagram_event`
- [ ] SC-3: While archify runs, the server shall run at most 2 renders at the same time.
  - verify: `cargo test -p wf-archify concurrency_limit`
- [ ] SC-4: If a render takes longer than 90 s, then the server shall mark the diagram as invalid with a timeout error.
  - verify: `cargo test -p wf-archify render_timeout`

## Out of scope

- Caching renders across workspaces.
- Rendering diagrams in the browser.

## Links

- [[wf-r6jk2]]: the research that sets the size hint in the `diagram` event.
- [[wf-t3jp5]]: the context bundle reads the node count from the render receipt.
- [[wf-3k9x2]]: the SSE stream that carries the event.
