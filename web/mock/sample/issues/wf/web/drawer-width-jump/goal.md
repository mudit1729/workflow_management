---
id: wf-e6kc1
title: Fix drawer width jump
status: planned
priority: low
size: xs
owner: "@shruti"
labels: [bug]
blocked_by: []
created: 2026-10-21T11:20+05:30
---

## Context

The drawer grows by 16 px when a tab with a long list opens, because the scrollbar appears and takes its width from the content. The title and the tabs shift to the left.

## Success criteria

- [ ] SC-1: When a user switches between drawer tabs, the drawer shall keep its width.
  - verify: `pnpm -C web test drawer-width`
- [ ] SC-2: The drawer shall reserve the scrollbar gutter on every tab.
  - verify: manual
