---
updated_at: 2026-10-16T13:00+05:30
updated_by: "@claude-sonnet"
revision: 1
---

## Approach

Build a matcher from the `avoid` lists of `glossary.md`. Run it over prose only, then print the preferred term as the fix.

## Assumptions

- A1: A glossary holds fewer than 200 avoided words. [confirmed]

## Phase 1: Rule

### T-1: Match avoided words on word boundaries
- status: done
- lane: core
- owns: `crates/wf-lint/src/s09.rs`
- satisfies: SC-1, SC-2
- assignee: role:backend
- claimed_by: @claude-sonnet
- verify: `cargo test -p wf-lint s09_whole_words`

Build one regex per `avoid` word with `\b` anchors. Compare case-insensitively.

### T-2: Skip code spans and links
- status: done
- lane: core
- depends_on: T-1
- owns: `crates/wf-lint/src/prose.rs`
- satisfies: SC-3
- assignee: role:backend
- claimed_by: @claude-sonnet
- verify: `cargo test -p wf-lint s09_skips_code`

Mask code spans, fenced blocks and link targets before the match.

### T-3: Print the preferred term as the fix
- status: review
- lane: core
- depends_on: T-1
- owns: `crates/wf-lint/src/fix.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @claude-sonnet
- verify: `cargo test -p wf-lint s09_reports_synonym`

Read the term name from the glossary entry and write it into `fix`.
