---
id: wf-h2tb7
title: Board keyboard navigation
status: in_progress
priority: medium
size: m
owner: "@shruti"
labels: [ux, a11y]
claimed_by: "@cursor-bot"
lease_until: 2026-10-22T16:53+05:30
blocked_by: []
created: 2026-10-18T15:40+05:30
---

## Context

Power users move through the board without a mouse. Today a card takes focus only with `Tab`, and a board with 40 cards needs 40 presses to reach the last one.

This issue adds the `j`, `k`, `h` and `l` keys to move focus between cards and columns, and `Enter` to open the drawer.

## Success criteria

- [x] SC-1: When a user presses `j` or `k`, the board shall move focus to the next or the previous card.
  - verify: `pnpm -C web test board-keys`
  - evidence: `pnpm -C web test board-keys` passed at `d3f8a19`
  - verified_by: @cursor-bot
- [ ] SC-2: When a user presses `h` or `l`, the board shall move focus to the neighbor column.
  - verify: `pnpm -C web test board-columns`
- [ ] SC-3: When a card has focus and the user presses `Enter`, the board shall open the drawer.
  - verify: `pnpm -C web test board-enter`
- [ ] SC-4: While a card has focus, the board shall draw a focus ring with a contrast ratio of at least 3:1.
  - verify: manual

## Out of scope

- Moving a card between columns with the keyboard. [[wf-z9mw2]] covers dragging.
- Custom key bindings.

## Links

- [[wf-z9mw2]]: drag issues between columns.
