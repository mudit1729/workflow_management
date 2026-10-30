---
id: lib-3fz8t
title: Push one-way live updates over SSE
kind: decision
description: Use when a local web UI needs live updates from a daemon and sends its writes over plain HTTP.
status: reviewed
tags: [sse, live, transport]
applies_to: [crates/wf-server/**, web/src/lib/live/**]
source:
  - "[[wf-3k9x2#D-7f3k2]]"
authors: ["@claude-opus"]
reviewed_by: "@shruti"
created: 2026-10-21
last_reviewed: 2026-10-21
review_after: 2027-04-19
---

## Decision

Push live updates over SSE. Send every write through `POST /api/ops`.

## Because

Data flows one way. SSE reconnects and replays with `Last-Event-ID`.

## Rejected

- WebSocket: two-way, more code.
- Polling every 2 s: misses a 2 s latency target.

## Revisit when

The UI needs to send updates over the live channel.
