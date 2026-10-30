# Changes

## 2026-08-05T13:40+05:30 @codex — A round-trip serializer dropped YAML comments {#C-5bq9m}
- kind: failure
- task: T-1
- result: fail
- evidence: `golden/goal.md` lost 3 comment lines
- files: `crates/wf-edit/src/serialize.rs`

Wrote `goal.md` back with a YAML serializer. The git diff showed 3 deleted comments and a reordered key.

## 2026-08-09T12:15+05:30 @codex — Spliced one frontmatter value by its span {#C-8vd4z}
- kind: fix
- task: T-1
- commit: c80e5f2
- files: `crates/wf-edit/src/splice.rs`
- model: gpt-5-codex

Replaced the bytes of the value and kept every other byte. The property test passes with 1024 cases.

## 2026-08-13T15:10+05:30 @mudit — Reviewed the editor and closed the issue {#C-3hn6t}
- kind: review

Read the diff of `wf-edit`. All three criteria hold evidence. Moved the issue to done.
