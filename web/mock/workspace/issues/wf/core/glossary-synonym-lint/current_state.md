---
summary: "The rule passes its tests; @shruti reviews the new library draft."
updated_at: 2026-10-22T15:37+05:30
updated_by: "@claude-sonnet"
phase: Rule
session: cc-5a90
---

## Done
- [[#T-1]] and [[#T-2]] match avoided words in prose. See [[#C-8tv2c]].
- [[#SC-1]], [[#SC-2]] and [[#SC-3]] have evidence from `wf verify`.

## In flight
- [[#T-3]] The fix text waits for a code review by @mudit.

## Needs you
- [ ] Q-3bw7m: Approve the draft `lib-7nq3d`, "Match glossary synonyms on whole words", as a pattern?
  - from: @claude-sonnet
  - to: @shruti
  - kind: approval
  - urgency: fyi
  - asked: 2026-10-22T15:32+05:30
  - options: approve, reject
  - ref: [[lib-7nq3d]]
  - answer:

## Handoff notes
- The matcher lives in `crates/wf-lint/src/s09.rs`. [[wf-k8dv6]] reuses it for S06.

## Next steps
1. Wait for the review of [[#T-3]] by @mudit.
2. Move the issue to done after the review and the answer to [[#Q-3bw7m]].
