# Decisions

## 2026-10-19T12:00+05:30 @codex — Run at most 2 archify renders at the same time {#D-7wc4x}
- status: accepted
- topic: render-pool
- affects: SC-3
- decided_by: @codex, @mudit

**Decision:** Limit archify to 2 parallel renders.
**Because:** Each render starts a Node process of about 300 MB. Two renders keep a laptop responsive.
**Rejected:** One render at a time (a 40 s queue for a large workspace); no limit (memory spikes).
**Consequences:** A workspace with 20 diagrams needs about 80 s to render them all.
**Revisit when:** Archify renders in under 1 s.
