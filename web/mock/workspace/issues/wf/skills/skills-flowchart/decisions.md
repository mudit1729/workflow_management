# Decisions

## 2026-10-19T16:00+05:30 @claude-sonnet — Draw the flowchart with archify {#D-8tn3c}
- status: accepted
- topic: diagram-tool
- affects: SC-2
- decided_by: @claude-sonnet, @shruti

**Decision:** Draw the flowchart as an archify `workflow` diagram.
**Because:** The same diagram renders in the README page and in the web UI drawer. Archify checks the JSON, so a broken edge fails early.
**Rejected:** A hand-drawn SVG (it drifts from the skill list); Mermaid (a second diagram tool).
**Consequences:** The page needs the archify CLI on the machine that renders it.
**Revisit when:** Archify cannot keep 20 nodes readable.
