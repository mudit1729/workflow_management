---
updated_at: 2026-10-22T12:17+05:30
updated_by: "@claude-opus"
revision: 3
---

## Approach

Treat each watcher event as a dirty hint. Rescan the nearest existing ancestor, diff the files by hash and push one `delta` per debounce window over SSE. One leader tab per browser holds the stream and shares events with the other tabs.

```archify workflow id=sse-delivery-flow
{
  "meta": {
    "title": "How a file change reaches the board"
  },
  "groups": [
    {
      "id": "server",
      "label": "wf serve"
    },
    {
      "id": "client",
      "label": "Browser"
    }
  ],
  "nodes": [
    {
      "id": "event",
      "label": "File event",
      "kind": "start",
      "group": "server",
      "note": "Create, change, rename or delete"
    },
    {
      "id": "debounce",
      "label": "Debounce 250 ms",
      "kind": "step",
      "group": "server",
      "note": "One burst of events becomes one pass"
    },
    {
      "id": "ancestor",
      "label": "Find nearest existing ancestor",
      "kind": "step",
      "group": "server",
      "note": "A deleted folder rescans its parent"
    },
    {
      "id": "rescan",
      "label": "Rescan subtree",
      "kind": "step",
      "group": "server"
    },
    {
      "id": "diff",
      "label": "blake3 diff",
      "kind": "step",
      "group": "server",
      "note": "Compare file hashes with the snapshot"
    },
    {
      "id": "changed",
      "label": "Any file changed?",
      "kind": "decision",
      "group": "server"
    },
    {
      "id": "drop",
      "label": "Drop the event",
      "kind": "end",
      "group": "server",
      "note": "Our own write came back (echo)"
    },
    {
      "id": "parse",
      "label": "Parse changed files",
      "kind": "step",
      "group": "server"
    },
    {
      "id": "rollups",
      "label": "Rebuild roll-ups and signals",
      "kind": "step",
      "group": "server"
    },
    {
      "id": "swap",
      "label": "Swap snapshot",
      "kind": "step",
      "group": "server",
      "note": "ArcSwap. Readers never block."
    },
    {
      "id": "broadcast",
      "label": "Broadcast delta",
      "kind": "step",
      "group": "server",
      "note": "SSE, ring buffer of 256 events"
    },
    {
      "id": "gap",
      "label": "Gap in Last-Event-ID?",
      "kind": "decision",
      "group": "client",
      "note": "The client slept or lagged behind"
    },
    {
      "id": "resync",
      "label": "Receive resync",
      "kind": "step",
      "group": "client"
    },
    {
      "id": "refetch",
      "label": "Refetch snapshot",
      "kind": "step",
      "group": "client"
    },
    {
      "id": "newer",
      "label": "Rev newer than ours?",
      "kind": "decision",
      "group": "client"
    },
    {
      "id": "skip",
      "label": "Ignore the delta",
      "kind": "end",
      "group": "client",
      "note": "We already applied it"
    },
    {
      "id": "apply",
      "label": "Apply to query cache",
      "kind": "step",
      "group": "client"
    },
    {
      "id": "fade",
      "label": "Fade changed cards",
      "kind": "end",
      "group": "client"
    }
  ],
  "edges": [
    {
      "from": "event",
      "to": "debounce"
    },
    {
      "from": "debounce",
      "to": "ancestor"
    },
    {
      "from": "ancestor",
      "to": "rescan"
    },
    {
      "from": "rescan",
      "to": "diff"
    },
    {
      "from": "diff",
      "to": "changed"
    },
    {
      "from": "changed",
      "to": "drop",
      "label": "no"
    },
    {
      "from": "changed",
      "to": "parse",
      "label": "yes"
    },
    {
      "from": "parse",
      "to": "rollups"
    },
    {
      "from": "rollups",
      "to": "swap"
    },
    {
      "from": "swap",
      "to": "broadcast"
    },
    {
      "from": "broadcast",
      "to": "gap",
      "label": "SSE event"
    },
    {
      "from": "gap",
      "to": "resync",
      "label": "yes"
    },
    {
      "from": "gap",
      "to": "newer",
      "label": "no"
    },
    {
      "from": "resync",
      "to": "refetch"
    },
    {
      "from": "refetch",
      "to": "apply",
      "label": "replace cache"
    },
    {
      "from": "newer",
      "to": "skip",
      "label": "no"
    },
    {
      "from": "newer",
      "to": "apply",
      "label": "yes"
    },
    {
      "from": "apply",
      "to": "fade"
    }
  ]
}
```

## Assumptions

- A1: notify 8.2 is enough on macOS if we rescan subtrees. [confirmed]
- A2: 256 events of replay cover a laptop sleep. [open]

## Prior art

- [[lib-4tz7c]]: rescan the subtree on every event; never trust event kinds.

## Phase 1: Index deltas

### T-1: Diff snapshots into deltas
- status: done
- lane: core
- owns: `crates/wf-index/src/delta.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-index delta`

Compare two snapshots by file hash. Emit one `Delta` with the upserted and removed issues and the changed details.
- [x] Add `Delta` with `rev`, the upsert lists and the remove lists.
- [x] Diff the per-file blake3 hashes of two snapshots.
- [x] List the changed issue IDs in `details_changed`.

### T-2: Suppress watcher echoes by content hash
- status: review
- lane: core
- owns: `crates/wf-index/src/watch.rs`
- satisfies: SC-5
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-index echo_suppression`

Record the hash of each file the daemon writes, as [[lib-8w3fd]] describes. Drop a watcher event when the file on disk still has that hash.
- [x] Store the hash of each write in the index.
- [x] Skip events whose file hash matches the stored hash.

## Phase 2: Live transport

### T-3: Build the SSE delta stream
- status: in_progress
- lane: server
- depends_on: T-1, T-2
- owns: `crates/wf-server/src/sse.rs`
- satisfies: SC-1, SC-3
- assignee: role:backend
- claimed_by: @codex
- lease_until: 2026-10-22T17:07+05:30
- verify: `cargo test -p wf-server sse`

Stream `delta` events from the index broadcast. Send `snapshot` on connect. Keep a ring of 256 events and replay them for `Last-Event-ID`.
- [x] Add the `GET /api/events` route.
- [ ] Answer a lagged client with `resync`.

## Phase 3: Board client

### T-4: Elect one leader tab over BroadcastChannel
- status: todo
- lane: web
- owns: `web/src/lib/live/leader.ts`
- satisfies: SC-4
- assignee: role:frontend
- verify: `pnpm -C web test leader`

Elect one leader tab with the Web Locks API. The leader opens the `EventSource` and relays each event to the other tabs over `BroadcastChannel`.
- [ ] Take the `wf-live` lock in each tab.
- [ ] Relay events from the leader over `BroadcastChannel`.

### T-5: Fade changed cards and show the reconnecting badge
- status: todo
- lane: web
- depends_on: T-3, T-4
- owns: `web/src/features/board/**`
- satisfies: SC-1, SC-3
- assignee: role:frontend
- verify: `pnpm -C web test live-highlight`

Fade each changed card for 150 ms. The fade probably needs the `--wf-dur-2` token. Show a reconnecting badge in the toolbar while the stream is down.
- [ ] Read the changed IDs from `issues_upserted`.
- [ ] Add the `wf-flash` class for 150 ms.
- [ ] Show the badge while the stream reconnects.
