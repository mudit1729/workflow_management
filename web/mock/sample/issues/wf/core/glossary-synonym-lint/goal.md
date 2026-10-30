---
id: wf-9gr4k
title: Glossary synonym lint (S09)
status: review
priority: medium
size: s
owner: "@mudit"
labels: [lint, glossary]
claimed_by: "@claude-sonnet"
blocked_by: []
created: 2026-10-16T12:30+05:30
---

## Context

`glossary.md` lists the words a team avoids, such as `ticket` for `issue`. Nothing checks the text against that list. The avoided words spread through goals, plans and entries, and two people name one thing in two ways.

Rule S09 flags a word from an `avoid` list and offers the preferred term as the fix.

## Success criteria

- [x] SC-1: When a file uses a word from an `avoid` list, the linter shall report S09 with the preferred term as the fix.
  - verify: `cargo test -p wf-lint s09_reports_synonym`
  - evidence: `cargo test -p wf-lint s09_reports_synonym` passed at `6e1c8d5`
  - verified_by: @claude-sonnet
- [x] SC-2: The linter shall match whole words only and ignore case.
  - verify: `cargo test -p wf-lint s09_whole_words`
  - evidence: `cargo test -p wf-lint s09_whole_words` passed at `6e1c8d5`
  - verified_by: @claude-sonnet
- [x] SC-3: If a word sits inside a code span or a link, then the linter shall skip it.
  - verify: `cargo test -p wf-lint s09_skips_code`
  - evidence: `cargo test -p wf-lint s09_skips_code` passed at `b20f7a4`
  - verified_by: @claude-sonnet

## Out of scope

- Rewriting the text. The linter prints a fix and changes no file.
- Synonyms in code comments.

## Links

- [[lib-7nq3d]]: match glossary synonyms on whole words.
- [[wf-k8dv6]]: the S06 rule shares the word matcher.
