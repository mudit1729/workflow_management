---
title: Build v1
kind: issue-summary
issue: wf-b1d7v
workspace: wf
group: wf
status: in_progress
rev: "6e13494"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Format, index and write protocol are done; the context bundle and the board are in flight. @mudit has claimed T-4 and @shruti has claimed T-5. 3 of 7 criteria are verified.

## Done so far

- Added the issue drawer on the mock server · [[wf-b1d7v#C-7qs5w]]
- Built the golden fixtures once per CI run · `d90b4e3` · [[wf-b1d7v#C-3tb6y]]
- Verified SC-3 with `write_conflict` · `2fa90c6` · [[wf-b1d7v#C-4zp7d]]
- Verified SC-2 with a 180 ms roll-up rebuild · `e41b8a7` · [[wf-b1d7v#C-9rm5t]]
- Verified SC-1 with `init_lints_clean` · `7c2e9d4` · [[wf-b1d7v#C-6hx3q]]

## Decisions

- [[wf-b1d7v#D-6kq4w]] Freeze wf_format at 1 before the first release (accepted)
- [[wf-b1d7v#D-2ns9h]] Ship the web build inside the binary (proposed)

## Learnings

- [[wf-b1d7v#L-5vz3k]] Start a session from the handoff bundle, not from the folder.
- [[wf-b1d7v#L-2pn6j]] Write each criterion so that a command or a named person can check it.

## Next

1. Land [[wf-t3jp5]] so that SC-5 gets evidence.
2. Claim [[wf-b1d7v#T-6]] and start [[wf-p2hs4]].
3. Verify [[wf-b1d7v#SC-4]] with its command after the board passes the manual check.
