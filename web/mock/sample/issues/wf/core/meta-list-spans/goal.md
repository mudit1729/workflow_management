---
id: wf-m3tq8
title: Parse meta lists with byte spans
status: done
priority: high
size: m
owner: "@mudit"
labels: [parser]
claimed_by: "@codex"
blocked_by: []
created: 2026-10-06T10:15+05:30
---

## Context

`wf-edit` changes one value at a time and must not touch any other byte. [[wf-9tq4e]] gave it spans for frontmatter. The meta lists in the body still returned plain strings. The writer rebuilt a whole list and dropped the spacing and the trailing comments that people had written.

This issue makes the parser return the byte span of every key and value in a meta list.

## Success criteria

- [x] SC-1: When the parser reads a meta list, the parser shall return the byte span of each key and each value.
  - verify: `cargo test -p wf-parse meta_spans`
  - evidence: `cargo test -p wf-parse meta_spans` passed at `3be71f0`
  - verified_by: @codex
- [x] SC-2: When a value changes, the writer shall leave every byte outside the span unchanged.
  - verify: `cargo test -p wf-edit span_splice_prop`
  - evidence: `cargo test -p wf-edit span_splice_prop` passed at `9a4d2c8` with 4096 cases
  - verified_by: @mudit
- [x] SC-3: If a meta line has a trailing comment, then the parser shall keep the comment out of the value span.
  - verify: `cargo test -p wf-parse meta_trailing_comment`
  - evidence: `cargo test -p wf-parse meta_trailing_comment` passed at `3be71f0`
  - verified_by: @codex
- [x] SC-4: The parser shall read the 400-line golden plan in under 5 ms.
  - verify: `cargo bench -p wf-parse meta_bench`
  - evidence: `cargo bench -p wf-parse meta_bench` read the plan in 1.8 ms at `9a4d2c8`
  - verified_by: @mudit

## Out of scope

- Spans for the body prose. Only meta lists and frontmatter need them.
- A new meta syntax.

## Links

- [[wf-9tq4e]]: spans for frontmatter values.
- [[lib-9vk2w]]: quote handles in YAML frontmatter.
