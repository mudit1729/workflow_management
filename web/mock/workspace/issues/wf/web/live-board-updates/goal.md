---
id: wf-3k9x2
title: Live board updates
status: in_progress
priority: high
size: m
owner: "@shruti"
labels: [live, sse]
claimed_by: "@claude-opus"
lease_until: 2026-10-22T17:02+05:30
blocked_by: []
due: 2026-10-30
created: 2026-10-19T09:12+05:30
---

## Context

Agents append changes from their terminals all day. Humans tick criteria and answer requests in the browser. Today the board shows those changes only after a manual reload, so a human reads old status and misses new needs-you requests.

This issue adds a live path from disk to the board. The daemon watches the workspace, rescans what changed and pushes each delta over SSE. The board must show a new entry within 2 s, without a reload.

```archify architecture id=live-board-architecture
{
  "meta": {
    "title": "Live board architecture"
  },
  "groups": [
    {
      "id": "writers",
      "label": "Writers"
    },
    {
      "id": "disk",
      "label": "Workspace on disk"
    },
    {
      "id": "server",
      "label": "wf serve"
    },
    {
      "id": "browser",
      "label": "Browser"
    }
  ],
  "nodes": [
    {
      "id": "claude",
      "label": "Claude Code",
      "kind": "actor",
      "group": "writers"
    },
    {
      "id": "codex",
      "label": "Codex",
      "kind": "actor",
      "group": "writers"
    },
    {
      "id": "hand",
      "label": "Hand edit",
      "kind": "actor",
      "group": "writers",
      "note": "Any editor. wf lint catches mistakes."
    },
    {
      "id": "cli",
      "label": "wf CLI",
      "kind": "service",
      "group": "writers",
      "note": "wf append and wf state"
    },
    {
      "id": "files",
      "label": "Issue folder",
      "kind": "store",
      "group": "disk",
      "note": "goal.md, plan.md, changes.md, current_state.md"
    },
    {
      "id": "watcher",
      "label": "Watcher",
      "kind": "service",
      "group": "server",
      "note": "notify 8.2 with a 250 ms debouncer"
    },
    {
      "id": "index",
      "label": "wf-index",
      "kind": "service",
      "group": "server",
      "note": "Rescan subtree, blake3 diff, parse, roll-ups"
    },
    {
      "id": "snapshot",
      "label": "Snapshot",
      "kind": "store",
      "group": "server",
      "note": "ArcSwap, swapped once per change"
    },
    {
      "id": "sse",
      "label": "wf-server",
      "kind": "service",
      "group": "server",
      "note": "SSE events: snapshot, delta, activity, resync. Ring buffer of 256."
    },
    {
      "id": "edit",
      "label": "wf-edit",
      "kind": "service",
      "group": "server",
      "note": "Lock, hash check, splice, atomic rename"
    },
    {
      "id": "leader",
      "label": "Leader tab",
      "kind": "client",
      "group": "browser",
      "note": "Holds the one EventSource"
    },
    {
      "id": "tabs",
      "label": "Other tabs",
      "kind": "client",
      "group": "browser",
      "note": "Follow the leader over BroadcastChannel"
    },
    {
      "id": "cache",
      "label": "Query cache",
      "kind": "store",
      "group": "browser",
      "note": "TanStack Query"
    },
    {
      "id": "board",
      "label": "Board",
      "kind": "ui",
      "group": "browser",
      "note": "Draws the cards and fades the ones that changed"
    }
  ],
  "edges": [
    {
      "from": "claude",
      "to": "cli"
    },
    {
      "from": "codex",
      "to": "cli"
    },
    {
      "from": "cli",
      "to": "files",
      "label": "per-file lock, atomic write"
    },
    {
      "from": "hand",
      "to": "files",
      "label": "by hand"
    },
    {
      "from": "files",
      "to": "watcher",
      "label": "file events"
    },
    {
      "from": "watcher",
      "to": "index",
      "label": "dirty path"
    },
    {
      "from": "index",
      "to": "snapshot",
      "label": "swap"
    },
    {
      "from": "index",
      "to": "sse",
      "label": "delta, activity"
    },
    {
      "from": "sse",
      "to": "leader",
      "label": "SSE"
    },
    {
      "from": "leader",
      "to": "tabs",
      "label": "BroadcastChannel"
    },
    {
      "from": "leader",
      "to": "cache",
      "label": "apply delta"
    },
    {
      "from": "cache",
      "to": "board",
      "label": "render"
    },
    {
      "from": "board",
      "to": "sse",
      "label": "POST /api/ops"
    },
    {
      "from": "sse",
      "to": "edit",
      "label": "op"
    },
    {
      "from": "edit",
      "to": "files",
      "label": "atomic rename"
    },
    {
      "from": "edit",
      "to": "index",
      "label": "new hash, echo ignored"
    }
  ]
}
```

## Success criteria

- [x] SC-1: When an agent appends to `changes.md`, the board shall show the entry within 2 s.
  - verify: `cargo test -p wf-index live_append`
  - evidence: `cargo test -p wf-index live_append` passed at `b81f03a`, see [[#C-v2n8s]]
  - verified_by: @codex
- [x] SC-2: If `goal.md` frontmatter is invalid, then the drawer shall show a lint finding and the raw file.
  - verify: manual
  - evidence: screenshot `evidence/sc2.png`, checked by @shruti
  - verified_by: @shruti
- [x] SC-3: While the event stream is down, the board shall show a reconnecting badge and replay missed events on reconnect.
  - verify: `pnpm -C web test live-reconnect`
- [ ] SC-4: When two tabs are open, the dashboard shall hold only one event-stream connection.
  - verify: manual
  - scenario: Given 2 open board tabs / When the leader tab closes / Then the other tab opens `/api/events` within 2 s
- [ ] SC-5: The daemon shall ignore the watcher echo of its own writes.
  - verify: `cargo test -p wf-index echo_suppression`

## Out of scope

- Two-way sync with Jira or Linear.
- A WebSocket transport. See [[#D-7f3k2]].
- More than one workspace per daemon.

## Links

- [[wf-7p4dn]]: index scan and snapshot.
- [[lib-4tz7c]]: rescan subtrees instead of trusting notify on macOS.
- [[lib-3fz8t]]: push one-way live updates over SSE.
- `spec/api.md`: the SSE event types.
