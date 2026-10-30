---
id: wf-9tq4e
title: Write back one value without reformatting
status: done
priority: high
size: m
owner: "@mudit"
labels: [write-back]
claimed_by: "@codex"
blocked_by: []
created: 2026-08-01T10:30+05:30
---

## Context

The web UI changes one value of a file, such as a status or a tick. A serializer that reads the whole file and writes it back drops comments, reorders keys and rewrites quotes. The git diff of a one-word change then fills a screen.

The editor must change only the bytes of the value and leave the rest of the file untouched.

## Success criteria

- [x] SC-1: When a user changes a status, the editor shall replace only the bytes of the status value.
  - verify: `cargo test -p wf-edit splice_status`
  - evidence: `cargo test -p wf-edit splice_status` passed at `c80e5f2`
  - verified_by: @codex
- [x] SC-2: If the file changed since the client read it, then the editor shall refuse the write.
  - verify: `cargo test -p wf-edit stale_rev_refused`
  - evidence: `cargo test -p wf-edit stale_rev_refused` passed at `c80e5f2`
  - verified_by: @codex
- [x] SC-3: When the editor writes a file, the editor shall write a temp file and rename it into place.
  - verify: `cargo test -p wf-edit atomic_write`
  - evidence: `cargo test -p wf-edit atomic_write` passed at `c80e5f2`
  - verified_by: @mudit

## Links

- [[wf-m3tq8]]: spans for meta lists, the next step.
- [[lib-2hq6n]]: splice one value span; never re-serialize frontmatter.
