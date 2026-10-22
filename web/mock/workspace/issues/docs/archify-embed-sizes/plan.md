---
updated_at: 2026-10-19T14:00+05:30
updated_by: "@claude-opus"
revision: 1
---

## Approach

Render 5 sample diagrams at 3 widths and record the height of each. Write one rule from the numbers, then test the rule in the drawer.

## Assumptions

- A1: Five sample diagrams cover the five diagram types. [confirmed]

## Phase 1: Measure

### T-1: Render the samples at 3 widths
- status: done
- lane: research
- satisfies: SC-1
- assignee: @claude-opus
- claimed_by: @claude-opus
- verify: manual

Render each sample at 440, 560 and 760 px and record the final height.

### T-2: Write the height rule
- status: in_progress
- lane: research
- depends_on: T-1
- satisfies: SC-2, SC-3
- assignee: @claude-opus
- claimed_by: @claude-opus
- lease_until: 2026-10-22T16:54+05:30
- verify: manual

Propose one rule with a cap. Say if `wf:size` is enough to reserve the height.
- [x] Draft the rule from the table.
- [ ] Test the rule in the drawer.
