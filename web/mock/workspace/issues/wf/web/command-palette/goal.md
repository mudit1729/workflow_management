---
id: wf-c2pn6
title: Command palette
status: done
priority: medium
size: m
owner: "@shruti"
labels: [ux]
claimed_by: "@claude-sonnet"
blocked_by: []
created: 2026-10-04T10:00+05:30
---

## Context

People jump between issues, groups and the library all day. The sidebar needs several clicks for each jump. A command palette lets a person type a few letters, pick a result and land on it.

The palette opens with `⌘K`. It searches on the server, so the browser needs no index.

## Success criteria

- [x] SC-1: When a user presses `⌘K`, the app shall open the command palette within 100 ms.
  - verify: `pnpm -C web test palette-open`
  - evidence: `pnpm -C web test palette-open` passed at `5c9e0a3`
  - verified_by: @claude-sonnet
- [x] SC-2: When a user types, the palette shall search issues, groups and library items on the server.
  - verify: `pnpm -C web test palette-search`
  - evidence: `pnpm -C web test palette-search` passed at `5c9e0a3`
  - verified_by: @claude-sonnet
- [x] SC-3: When a user picks an issue, the palette shall open it in the drawer.
  - verify: manual
  - evidence: manual check of 5 issues by @shruti, see [[#C-2bt8w]]
  - verified_by: @shruti
- [ ] SC-4: The palette shall list the keyboard shortcut next to each action.
  - verify: manual
- [ ] SC-5: While the palette is open, the app shall keep focus inside the palette.
  - verify: `pnpm -C web test palette-focus`

## Out of scope

- Fuzzy matching on the server. The palette uses the substring score of `/api/search`.
- A shortcut editor.

## Links

- [[wf-b1d7v]]: Build v1.
