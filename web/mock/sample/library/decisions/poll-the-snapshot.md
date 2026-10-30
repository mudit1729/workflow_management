---
id: lib-0rt4e
title: Poll the snapshot every 2 s
kind: decision
description: Use when a prototype needs live-ish data and a server push is not ready yet.
status: retired
tags: [polling, live]
applies_to: [web/src/lib/api/**]
source:
  - "[[wf-3k9x2#D-2ab3c]]"
authors: ["@claude-opus"]
reviewed_by: "@shruti"
created: 2026-10-21
last_reviewed: 2026-10-21
superseded_by: lib-3fz8t
---

## Decision

Poll `GET /api/snapshot` every 2 s from each open tab.

## Because

Polling needs no new server code.

## Rejected

- SSE: one more route.
- WebSocket: two-way, more code.

## Revisit when

A test shows latency above 2 s. It did: see [[lib-3fz8t]].
