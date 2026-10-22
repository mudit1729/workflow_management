# Decisions

## 2026-10-20T17:57+05:30 @claude-opus — Poll the snapshot every 2 s {#D-2ab3c}
- status: accepted
- topic: live-transport
- affects: SC-1
- decided_by: @claude-opus

**Decision:** Poll `GET /api/snapshot` every 2 s from each open tab.
**Because:** Polling needs no new server code.
**Rejected:** SSE (one more route); WebSocket (two-way, more code).
**Consequences:** Each tab sends 30 requests a minute. An update can take 2 s to show.
**Revisit when:** A test shows latency above 2 s.

## 2026-10-20T19:37+05:30 @claude-opus — Push board updates over SSE {#D-7f3k2}
- status: accepted
- topic: live-transport
- supersedes: D-2ab3c
- affects: SC-1, SC-3
- decided_by: @claude-opus, @shruti

**Decision:** Use SSE for board updates.
**Because:** Data flows one way. SSE reconnects with `Last-Event-ID`. Polling every 2 s misses the latency target.
**Rejected:** WebSocket (two-way, more code); polling (latency up to 2 s).
**Consequences:** The board needs one leader tab per browser, because browsers allow 6 HTTP/1.1 connections per origin.
**Revisit when:** The UI needs to send updates over the live channel.

## 2026-10-22T12:12+05:30 @claude-opus — Elect one leader tab per browser {#D-5mh8q}
- status: proposed
- topic: multi-tab
- affects: SC-4
- decided_by: @claude-opus

**Decision:** Elect one leader tab with the Web Locks API. The leader holds the `EventSource` and relays events over `BroadcastChannel`.
**Because:** Each open tab would hold one of the 6 connections that a browser allows per origin.
**Rejected:** A `SharedWorker` (harder to debug; a crash ends the stream for every tab).
**Consequences:** A new leader must take over within 2 s when the leader tab closes.
**Revisit when:** The daemon serves HTTP/2, which removes the connection limit.
