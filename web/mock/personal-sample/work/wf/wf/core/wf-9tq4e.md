---
title: Write back one value without reformatting
kind: issue-summary
issue: wf-9tq4e
workspace: wf
group: wf/core
status: done
rev: "90848ad"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

Editor splices one value and writes the file atomically; done. 3 of 3 criteria are verified.

## Done so far

- Spliced one frontmatter value by its span · `c80e5f2` · [[wf-9tq4e#C-8vd4z]]

## Decisions

- [[wf-9tq4e#D-3qv8n]] Splice one value span in frontmatter (accepted)

## Learnings

None.

## Next

1. Add spans for meta lists in [[wf-m3tq8]].
