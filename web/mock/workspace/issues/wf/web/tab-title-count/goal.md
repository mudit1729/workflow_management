---
id: wf-7yq2m
title: Fix tab-title count
status: planned
priority: medium
size: xs
owner: @shruti
labels: [bug]
blocked_by: []
created: 2026-10-20T09:50+05:30
---

## Context

The browser tab title shows `(5) wf`, but only 2 requests wait for @shruti. The count includes requests for other authors.

The fix is small. The count must use `useInbox().mine`. The `owner` line of this file also needs quotes. See [[lib-9vk2w]].

## Success criteria

- [ ] SC-1: When a request is addressed to another author, the tab title count shall not include it.
  - verify: `pnpm -C web test title-count`
- [ ] SC-2: When no request waits for the acting author, the tab title shall show `wf` without a number.
  - verify: `pnpm -C web test title-count`
