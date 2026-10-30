# Changes

## 2026-10-17T15:00+05:30 @claude-sonnet — Matched avoided words on word boundaries {#C-3qy7n}
- kind: progress
- task: T-1
- commit: 6e1c8d5
- files: `crates/wf-lint/src/s09.rs`
- model: claude-sonnet-5-5

Built one regex per `avoid` word. The first version matched `story` inside `history`, so the regex now uses `\b` anchors.

## 2026-10-19T14:20+05:30 @claude-sonnet — Tested S09 on the dogfood workspace {#C-8tv2c}
- kind: test
- task: T-2
- criteria: SC-1, SC-2, SC-3
- result: pass
- commit: b20f7a4
- files: `crates/wf-lint/tests/s09.rs`
- model: claude-sonnet-5-5

Ran S09 on 26 issues. It found 7 uses of `ticket` and `card`, and no false match in a code span.

## 2026-10-22T14:27+05:30 @claude-sonnet — Promoted L-3nz8w to the draft lib-7nq3d {#C-5mx9a}
- kind: progress
- files: `library/patterns/match-synonyms-on-word-boundaries.md`
- model: claude-sonnet-5-5

Ran `wf promote wf-9gr4k#L-3nz8w --kind pattern`. The draft links back to the learning and asks @shruti to review it.

## 2026-10-22T15:17+05:30 @mudit — Reviewed the S09 matcher {#C-7bh4k}
- kind: review
- task: T-2

Read `s09.rs` and `prose.rs`. Asked for a test with a link target that holds an avoided word. Left the fix text for the next pass.
