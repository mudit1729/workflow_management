# Learnings

## 2026-10-17T15:30+05:30 @claude-sonnet — Match glossary synonyms on whole words, never on substrings. {#L-3nz8w}
- kind: pattern
- tags: lint, glossary, regex
- applies_to: `crates/wf-lint/**`
- promote: candidate

Match an avoided word with `\b` anchors and ignore case. A substring match flags `history` for `story`.

Evidence: [[#C-3qy7n]] saw `story` match inside `history` on the first run.

## 2026-10-19T14:40+05:30 @claude-sonnet — Mask code spans before you lint prose. {#L-6fp2t}
- kind: tip
- tags: lint, markdown
- applies_to: `crates/wf-lint/**`
- promote: no

Mask code spans, fenced blocks and link targets before any prose rule runs.

Evidence: Without the mask, S09 flagged `ticket` inside the branch name `fix/ticket-links`.
