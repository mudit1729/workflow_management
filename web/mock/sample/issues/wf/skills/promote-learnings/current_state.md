---
summary: "Promote and approve both work in the daemon; the dialog is in flight."
updated_at: 2026-10-22T13:17+05:30
updated_by: "@claude-sonnet"
phase: Review flow
library_refs: [lib-5cw1e]
session: cc-c4d0
---

## Done
- [[#T-1]] Promote writes the draft. See [[#C-5hk9f]].
- [[#T-2]] Approve sets the review fields. See [[#C-8dq3p]].
- [[#SC-1]] has evidence from `wf verify`. See [[#C-2wz7m]].

## In flight
- [[#T-3]] The promote dialog. @shruti holds the lease. The kind, the slug and the preview work.

## Blocked
- [[#T-4]] is not ready. [[wf-t3jp5]] holds a live lease on `crates/wf-cli/src/context/`.

## Handoff notes
- The dedupe score lives in the mock server for the prototype. The real daemon computes it in `wf-index`.

## Next steps
1. Finish the merge suggestion in [[#T-3]].
2. Claim [[#T-5]] and write the review request.
3. Claim [[#T-4]] after [[wf-t3jp5]] releases its lease.
