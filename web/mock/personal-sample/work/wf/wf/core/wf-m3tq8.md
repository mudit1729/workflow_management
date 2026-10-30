---
title: Parse meta lists with byte spans
kind: issue-summary
issue: wf-m3tq8
workspace: wf
group: wf/core
status: done
rev: "3aa6a9c"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

`wf-edit` splices every meta value through its span; done. 4 of 4 criteria are verified.

## Done so far

- Benchmarked the golden plan at 1.8 ms · `9a4d2c8` · [[wf-m3tq8#C-4pr7y]]
- Tested the splice with 4096 random lists · `9a4d2c8` · [[wf-m3tq8#C-8wh5t]]
- Returned spans for keys and values · `3be71f0` · [[wf-m3tq8#C-3xc9k]]
- Added Span to the meta-list model · `1d8e5a2` · [[wf-m3tq8#C-6gb2n]]

## Decisions

- [[wf-m3tq8#D-5fm3v]] Store spans as byte offsets (accepted)

## Learnings

- [[wf-m3tq8#L-4dz9w]] Quote an @handle in YAML frontmatter; a meta list takes it bare.

## Next

1. Reopen this issue if a new meta key needs its own span rule.
