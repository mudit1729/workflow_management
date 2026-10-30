---
id: lib-2hq6n
title: Splice one value span; never re-serialize frontmatter
kind: pattern
description: Use when a tool must change one frontmatter value in a file that humans also edit. Keep comments, order and quoting.
status: reviewed
tags: [yaml, write-back, frontmatter]
applies_to: [crates/wf-edit/**]
source:
  - "[[wf-9tq4e#D-3qv8n]]"
authors: ["@codex", "@mudit"]
reviewed_by: "@mudit"
created: 2026-08-08
last_reviewed: 2026-08-09
review_after: 2026-10-17
---

## Rule

Parse the frontmatter with spans. Replace only the bytes of the target value. Write the file with an atomic rename.

## When to use

Any write-back to `goal.md`, `plan.md` or a library item.

## Example

`wf move wf-3k9x2 review` replaces the 11 bytes of `in_progress` and leaves the rest of the file byte-identical.

## Evidence

- [[wf-9tq4e#D-3qv8n]]: a round-trip serializer dropped YAML comments.
