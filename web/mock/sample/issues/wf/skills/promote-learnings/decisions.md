# Decisions

## 2026-10-17T12:00+05:30 @claude-sonnet — Start every promoted item as a draft {#D-3gx7k}
- status: accepted
- topic: review-gate
- affects: SC-2, SC-4
- decided_by: @claude-sonnet, @shruti

**Decision:** Create every promoted item with `status: draft`. Only an approval sets `reviewed`.
**Because:** An unreviewed rule can mislead an agent. A draft stays visible to people and hidden from the bundle.
**Rejected:** Promote straight to `reviewed` for the group owner (two code paths, one gate).
**Consequences:** Each promote opens a review request. A draft that nobody reviews stays out of the bundle.
**Revisit when:** More than 5 drafts wait for a review at the same time.
