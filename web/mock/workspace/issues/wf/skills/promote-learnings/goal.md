---
id: wf-x5hd3
title: Promote learnings to the library
status: in_progress
priority: medium
size: m
owner: "@shruti"
labels: [library]
claimed_by: "@claude-sonnet"
lease_until: 2026-10-22T17:11+05:30
blocked_by: []
due: 2026-11-03
created: 2026-10-16T11:00+05:30
---

## Context

Agents write learnings in `learnings.md`, and the rest of the team never reads them. The library holds the rules worth keeping, but a promotion today means copying text by hand and losing the link to the evidence.

This issue adds `wf promote`. It copies a learning or a decision into `library/` as a draft with a `source:` backlink. It then asks the group owner to review the draft. Agents read reviewed items only.

## Success criteria

- [x] SC-1: When a user promotes a learning, the daemon shall create a draft library item with a `source:` backlink to the entry.
  - verify: `cargo test -p wf-edit promote_creates_draft`
  - evidence: `cargo test -p wf-edit promote_creates_draft` passed at `5d0c3b9`, see [[#C-2wz7m]]
  - verified_by: @codex
- [ ] SC-2: While a library item is a draft, the CLI shall leave it out of `wf context`.
  - verify: `cargo test -p wf-cli context_skips_drafts`
- [ ] SC-3: If a library item with a similar title exists, then the promote dialog shall suggest a merge.
  - verify: manual
  - scenario: Given a library item titled `Rescan subtrees instead of trusting notify on macOS` / When a user promotes a learning titled `notify drops rename events on macOS` / Then the dialog shows `Similar: lib-4tz7c` and a merge action
- [x] SC-4: When the group owner approves a draft, the daemon shall set `status: reviewed` and `last_reviewed` to today.
  - verify: `cargo test -p wf-edit approve_sets_reviewed`
  - evidence: `cargo test -p wf-edit approve_sets_reviewed` passed at `a82e6f1`, see [[#C-8dq3p]]
  - verified_by: @claude-sonnet

## Out of scope

- Merging two library items. The dialog only suggests a merge.
- Auto-promoting a learning without a person in the loop.

## Links

- [[lib-5cw1e]]: review promoted items before agents read them.
- [[wf-9gr4k]]: the first promote that used this flow.
- [[wf-b1d7v]]: Build v1.
