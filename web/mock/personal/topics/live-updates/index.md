---
title: Live board updates without polling
kind: topic
status: done
question: How should the board learn about a change on disk without polling?
tags: [web, transport, sse]
updated: 2026-10-26
sources:
  - https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  - https://html.spec.whatwg.org/multipage/server-sent-events.html
  - https://www.rfc-editor.org/rfc/rfc6455
---

## Summary

Use server-sent events. The board is read-mostly: the daemon pushes each change, and a browser writes over ordinary requests, so a one-way stream is enough. Over HTTP/1.1 a browser opens at most 6 event streams per domain across all its tabs, so one tab holds the stream and shares it with the rest. Decided in issue `wf-3k9x2` (decision D-7f3k2).

## Findings

- An event stream is a plain HTTP response of type `text/event-stream`, and the browser reconnects by itself. [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- On reconnect the browser sends the id of the last event it saw as `Last-Event-ID`, so a server can replay what was missed. [HTML Standard: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- Without HTTP/2 the browser allows 6 connections per domain, shared by every tab. With HTTP/2 the limit is the number of streams, 100 by default. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- WebSocket is the right tool when the client must send on the same channel. It is full duplex, which the board does not need. [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)
- Polling every 2 s costs each open tab 30 requests a minute and still shows a change up to 2 s late. That is why the first decision (D-2ab3c) was replaced.

## Open questions

- Does a leader tab chosen with the Web Locks API take over within 2 s when it closes? Proposed in D-5mh8q, not yet measured.

## Notes

- [[topics/live-updates/sse-vs-websocket]]: the three options side by side.
- [[topics/live-updates/lagged-clients]]: what happens when a tab falls behind.
