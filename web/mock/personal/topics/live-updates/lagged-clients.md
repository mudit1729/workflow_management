---
title: A tab that falls behind
kind: note
topic: live-updates
updated: 2026-10-24
author: "@shruti"
---

A tab can miss events: the laptop sleeps, the network drops, the tab is in the background. The stream has to say what to do when it comes back.

## The rule

The server keeps the last 256 events in a ring buffer. A returning tab sends the id of the last event it saw.

1. The id is still in the buffer: the server replays everything after it.
2. The id is older than the buffer: the server sends `resync`, and the tab loads a fresh snapshot.

The mock server follows the same rule (`RING_SIZE` is 256), so the prototype shows what the daemon is meant to do.

## Why 256

A 10 minute soak test on the wf workspace produced 140 events. 256 covers that with room, and a tab that was away longer is better served by a snapshot than by a long replay.

## What the board shows

- While the stream is down, the nav says "Reconnecting…".
- After a replay, each card that changed flashes once.
- After `resync`, the board loads everything again. Nothing flashes, because there is no list of what changed.

## Not yet decided

- Should a tab in the background close its stream and `resync` when it comes back? It would free a connection of the six.
