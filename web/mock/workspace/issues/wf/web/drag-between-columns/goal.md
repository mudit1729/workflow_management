---
id: wf-z9mw2
title: Drag issues between columns
status: review
priority: high
size: m
owner: "@shruti"
labels: [board, dnd]
claimed_by: "@claude-sonnet"
blocked_by: []
created: 2026-10-13T14:20+05:30
---

## Context

A status change today needs three clicks: open the card, open the status menu, pick a status. People expect to drag a card to another column, as they do in every board.

A drop writes the new status through the same op as the menu, so the transition rules and the done gate stay in one place.

## Success criteria

- [x] SC-1: When a user drops a card on another column, the board shall move the issue to that status.
  - verify: `pnpm -C web test dnd-move`
  - evidence: `pnpm -C web test dnd-move` passed at `e92b4d7`
  - verified_by: @claude-sonnet
- [x] SC-2: If the move is illegal, then the board shall show the gate dialog and keep the card in place.
  - verify: `pnpm -C web test dnd-gate`
  - evidence: `pnpm -C web test dnd-gate` passed at `e92b4d7`
  - verified_by: @claude-sonnet
- [x] SC-3: While a drag is active, the board shall highlight the target column.
  - verify: manual
  - evidence: manual check in both themes by @shruti, see [[#C-6cp5k]]
  - verified_by: @shruti
- [x] SC-4: When a drop fails with a conflict, the board shall roll the card back.
  - verify: `pnpm -C web test dnd-rollback`

## Out of scope

- Reordering cards inside a column. The order follows priority and activity.
- Dragging an issue to another group.

## Links

- [[wf-h2tb7]]: keyboard navigation of the same board.
- [[wf-c2pn6]]: the command palette also moves issues.
