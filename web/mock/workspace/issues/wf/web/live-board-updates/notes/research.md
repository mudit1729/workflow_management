# Delivering board updates

Input for [[#D-7f3k2]], written by @codex.

## Options

| Need | SSE | WebSocket | Polling every 2 s |
|---|---|---|---|
| Direction of data | Server to browser | Both ways | Browser asks |
| Reconnect and replay | Built in with `Last-Event-ID` | Custom code | Not needed |
| Latency | Under 100 ms | Under 100 ms | Up to 2 s |
| Server code | One axum route | A socket handler and a protocol | None |

## Findings

- The board writes through `POST /api/ops`. The live channel only reads.
- Browsers allow 6 HTTP/1.1 connections per origin. Each open tab holds one stream, so the board needs one leader tab.
- notify 9.0-rc reports a folder rename as `Remove(Any)` without the old path. notify 8.2 with a subtree rescan passes `rename_folder`.

## Recommendation

Use SSE with a ring of 256 events. Elect one leader tab per browser and share events over `BroadcastChannel`.
