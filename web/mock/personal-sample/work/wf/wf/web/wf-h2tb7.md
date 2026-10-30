---
title: Navigate the board by keyboard
kind: issue-summary
issue: wf-h2tb7
workspace: wf
group: wf/web
status: in_progress
rev: "539ee34"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

j and k work; h and l still need a rule for empty columns. 1 of 4 criteria is verified.

## Done so far

- Verified SC-1 with `board-keys` · `d3f8a19` · [[wf-h2tb7#C-8sy2p]]
- Moved focus between cards with j and k · `7aa0e53` · [[wf-h2tb7#C-4kg7j]]

## Decisions

None.

## Learnings

None.

## Next

1. Skip empty columns when `h` or `l` moves focus.
2. Add `board-columns` and `board-enter` tests.
3. Write `plan.md` with the `write-plan` skill.
