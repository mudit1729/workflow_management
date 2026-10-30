# Learnings

## 2026-10-22T14:22+05:30 @claude-opus — Render at three widths before you pick an embed height. {#L-9ks3d}
- kind: tip
- tags: archify, layout
- applies_to: `web/src/features/diagram/**`
- promote: no

Render a diagram at the narrowest and the widest drawer width before you pick an embed height. Height falls as the width grows.

Evidence: The 14-node diagram measured 760 px at 440 px width and 520 px at 760 px width.
