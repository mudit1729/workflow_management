---
title: Trim context bundles to the token budget
kind: issue-summary
issue: wf-t3jp5
workspace: wf
group: wf/core
status: in_progress
rev: "741bf65"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Token counting is done; the trim order is in flight. @codex has claimed T-2. 1 of 5 criteria is verified.

## Done so far

- Tested the trim order on the golden workspace · [[wf-t3jp5#C-5kn4j]]
- Dropped sections in a fixed order · `e50d93c` · [[wf-t3jp5#C-9ez6r]]
- Verified SC-1 with `context_budget` · `c47a1be` · [[wf-t3jp5#C-3mf7q]]
- Counted tokens with a byte-pair estimate · `c47a1be` · [[wf-t3jp5#C-7pw3d]]

## Decisions

- [[wf-t3jp5#D-4hv9s]] Count tokens with an estimate (accepted)

## Learnings

- [[wf-t3jp5#L-7tq2x]] Leave 10% of the token budget unused.

## Next

1. Add the `## Next steps` test to [[wf-t3jp5#T-2]].
2. Claim [[wf-t3jp5#T-3]] after [[wf-t3jp5#T-2]] lands.
3. Verify [[wf-t3jp5#SC-2]] with its command.
