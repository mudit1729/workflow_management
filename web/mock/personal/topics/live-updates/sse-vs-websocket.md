---
title: SSE, WebSocket or polling
kind: note
topic: live-updates
updated: 2026-10-26
author: "@shruti"
---

The three ways the board could hear about a change, judged on what the board needs: the server speaks, the browser mostly listens, and a missed event must be recoverable.

| | Polling | SSE | WebSocket |
|---|---|---|---|
| Direction | Browser asks | Server to browser | Both ways |
| Delay | Up to the interval, 2 s | Immediate | Immediate |
| Reconnect | Not needed | Built in, with `Last-Event-ID` | Written by hand |
| Server code | None new | One route | A protocol upgrade and a message loop |
| Open connections | None | 1 per tab, up to 6 per domain on HTTP/1.1 | 1 per tab |

## Why SSE

- The board never sends on the live channel. Edits go through `POST /api/ops`, which also gives them a revision check.
- Reconnecting with the last event id is the same recovery the board needs after a sleeping laptop.
- It is one more route, not a second protocol.

## What it costs

The 6-connection limit is per browser and domain, not per tab. Three tabs of the board would hold three of the six connections. The fix is one leader tab that holds the stream and relays events to the others with a `BroadcastChannel`. That is decision D-5mh8q of `wf-3k9x2`, still proposed.

> [!NOTE]
> HTTP/2 removes the limit, and the daemon may serve it later. The leader tab is then optional.

## Revisit when

The UI needs to send updates over the live channel. Then WebSocket is the better fit.
