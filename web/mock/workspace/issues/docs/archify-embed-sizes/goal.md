---
id: wf-r6jk2
title: Research archify embed sizes
status: in_progress
priority: medium
size: s
owner: "@shruti"
labels: [research, archify]
claimed_by: "@claude-opus"
lease_until: 2026-10-22T16:54+05:30
blocked_by: []
created: 2026-10-19T13:40+05:30
---

## Context

The drawer embeds archify diagrams in an iframe. A fixed height clips a tall diagram, and a tall default wastes space for a small one. This note finds a height rule that works for every diagram type at drawer widths from 440 px to 760 px.

[[wf-w8vz4]] waits for the answer, because the `diagram` event carries a height hint.

## Success criteria

- [x] SC-1: The note shall list the rendered height of each sample diagram at 440, 560 and 760 px.
  - verify: manual
  - evidence: table in `notes/embed-sizes.md`, checked by @shruti
  - verified_by: @shruti
- [ ] SC-2: The note shall recommend one height rule with a cap in px.
  - verify: manual
- [ ] SC-3: The note shall say whether the `wf:size` message is enough to reserve the height before the load.
  - verify: manual

## Out of scope

- Changing the archify renderer.
- Zoom and pan inside the embed.

## Links

- [[wf-w8vz4]]: background renders, blocked by this note.
- `notes/embed-sizes.md`: the measurements.
