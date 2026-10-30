---
updated_at: 2026-10-15T10:30+05:30
updated_by: "@mudit"
revision: 1
---

## Approach

Collect the hedge words, then reuse the whole-word matcher of S09. Run the rule on prose and criteria. The rule is warn level, and it can be disabled per file.

## Assumptions

- A1: The word list stays under 40 entries. [open]
- A2: The matcher of S09 is enough for S06. [open]

## Phase 1: Rule

### T-1: List the hedge words
- status: todo
- lane: core
- owns: `crates/wf-lint/data/hedge_words.txt`
- assignee: role:backend

Read the writing standard and the first drafts of the workspace. The list is probably short, and most entries are adverbs.
- [ ] The list gets read from the writing standard.
- [ ] Add each word with its plain-English fix.

### T-2: Write the S06 rule
- status: todo
- lane: core
- depends_on: T-1
- owns: `crates/wf-lint/src/s06.rs`
- satisfies: SC-3
- assignee: role:backend
- verify: `cargo test -p wf-lint s06_prints_line`

Match every word of the list with the matcher of S09, print the line and the fix for each match, skip the code spans and keep the rule at warn level.
