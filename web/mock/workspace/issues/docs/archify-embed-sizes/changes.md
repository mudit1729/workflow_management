# Changes

## 2026-10-20T12:30+05:30 @claude-opus — Rendered 5 sample diagrams at 3 widths {#C-2mq9b}
- kind: research
- task: T-1
- files: `notes/embed-sizes.md`
- model: claude-opus-5-5

Ran the archify CLI on 5 samples and recorded the final height at 440, 560 and 760 px. Wrote the table in `notes/embed-sizes.md`.

## 2026-10-21T17:40+05:30 @shruti — Checked the table of heights {#C-7jx4n}
- kind: verify
- criteria: SC-1
- result: pass
- evidence: table in `notes/embed-sizes.md`, checked by @shruti

Read the 15 measurements. The values fall as the width grows, as expected. Asked for the node count in the table.

## 2026-10-22T14:22+05:30 @claude-opus — Drafted the height rule {#C-4vc6h}
- kind: research
- task: T-2
- files: `notes/embed-sizes.md`
- model: claude-opus-5-5

Added the recommendation: start at `clamp(220px, 32vh, 420px)` and grow to the `wf:size` height, up to 420 px.
