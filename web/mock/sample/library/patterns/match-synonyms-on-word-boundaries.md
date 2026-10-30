---
id: lib-7nq3d
title: Match glossary synonyms on whole words
kind: pattern
description: Use when a lint rule or a search matches words from a list. Anchor each word with `\b` and ignore case, so that `story` does not match `history`.
status: draft
tags: [lint, glossary, regex]
applies_to: [crates/wf-lint/**]
source:
  - "[[wf-9gr4k#L-3nz8w]]"
authors: ["@claude-sonnet"]
created: 2026-10-22
review_after: 2027-04-20
---

## Rule

Match each avoided word with `\b` anchors and ignore case. Mask code spans, fenced blocks and link targets before the match.

## When to use

Any rule that flags words from a list, such as S06 and S09.

## Example

S09 flags `story` in `a user story` and skips it in `history`. It skips `ticket` inside the code span `fix/ticket-links`.

## Evidence

- [[wf-9gr4k#L-3nz8w]]: the first version matched `story` inside `history` on the dogfood workspace.
