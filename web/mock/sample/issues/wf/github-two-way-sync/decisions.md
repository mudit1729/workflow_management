# Decisions

## 2026-10-08T12:20+05:30 @mudit — Sync GitHub issues in both directions {#D-3rk8y}
- status: rejected
- topic: scope
- decided_by: @mudit, @shruti

**Decision:** Do not build a two-way sync with GitHub issues in v1.
**Because:** Two writers need a conflict rule, and the format has none. The files are the source of truth.
**Rejected:** A one-way export (reconsider after v1); a two-way sync with last-writer-wins (loses edits).
**Consequences:** Teams that use GitHub issues copy the link into `## Links` by hand.
**Revisit when:** Three teams ask for the sync after v1.
