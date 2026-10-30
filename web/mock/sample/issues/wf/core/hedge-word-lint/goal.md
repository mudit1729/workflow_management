---
id: wf-k8dv6
title: Lint hedge words (S06)
status: planned
priority: low
size: s
owner: "@mudit"
labels: [lint, writing]
blocked_by: []
created: 2026-10-14T16:45+05:30
---

## Context

Hedge words such as "maybe" and "probably" make a goal or a step impossible to check. An agent that reads "this might need a retry" cannot tell whether to retry. The writing standard bans them, but no rule enforces the ban, and the first drafts of this workspace still hold dozens of them because nobody reads the standard before they write a goal.

Rule S06 flags a hedge word in prose and in criteria. It is probably the cheapest rule to build, because the word list is short and the matcher of S09 already exists. The team may want to extend the list later. Hedge words that appear inside code spans are being skipped by the matcher, which is why the lint on this file looks noisy.

## Success criteria

- [ ] SC-1: The linter shall flag hedge words.
- [ ] SC-2: Flagged hedge words are easy to fix.
- [x] SC-3: When `wf lint` finds a hedge word, the linter shall print the word, its line and a fix.
  - verify: `cargo test -p wf-lint s06_prints_line`
- [ ] SC-4: If a hedge word sits inside a code span, then the linter shall ignore the word.
  - verify: `cargo test -p wf-lint s06_skips_code`

## Out of scope

- Rewriting the hedged sentence. The linter prints a fix and changes no file.
- Hedge words in other languages.

## Links

- [[wf-9gr4k]]: the S09 matcher that S06 reuses.
- [[lib-k2s7b]]: write criteria as EARS sentences.
