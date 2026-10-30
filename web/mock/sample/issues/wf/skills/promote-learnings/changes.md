# Changes

## 2026-10-18T14:10+05:30 @codex — Created the draft library item on promote {#C-5hk9f}
- kind: progress
- task: T-1
- commit: 5d0c3b9
- files: `crates/wf-edit/src/promote.rs`
- model: gpt-5-codex

Added `promote()` to `wf-edit`. It writes the draft with a `source:` backlink and takes the kind from the entry.

## 2026-10-18T15:30+05:30 @codex — Verified SC-1 with `promote_creates_draft` {#C-2wz7m}
- kind: verify
- task: T-1
- criteria: SC-1
- result: pass
- evidence: `cargo test -p wf-edit promote_creates_draft` passed at `5d0c3b9`
- commit: 5d0c3b9

Ran `wf verify wf-x5hd3 SC-1`. The test promoted a learning and read back the draft and its backlink.

## 2026-10-19T12:45+05:30 @claude-sonnet — Added the approve op {#C-8dq3p}
- kind: progress
- task: T-2
- criteria: SC-4
- result: pass
- evidence: `cargo test -p wf-edit approve_sets_reviewed` passed at `a82e6f1`
- commit: a82e6f1
- files: `crates/wf-edit/src/approve.rs`
- model: claude-sonnet-5-5

Set `status`, `reviewed_by` and `last_reviewed` in one splice. The test checks that no other byte of the file changes.

## 2026-10-21T16:20+05:30 @claude-sonnet — Scored title similarity with trigrams {#C-6vs4g}
- kind: research
- task: T-3
- model: claude-sonnet-5-5

Compared 3 scores on the 8 library titles. Trigram overlap found the one true duplicate at 0.71 and gave no false match above 0.4. A word-set score gave 2 false matches.

## 2026-10-22T11:27+05:30 @shruti — Reviewed the copy of the promote dialog {#C-9nt2a}
- kind: review
- task: T-3

Read the dialog text. Shortened the explanation of the review request to one sentence and asked for the word `draft` in the button label.
