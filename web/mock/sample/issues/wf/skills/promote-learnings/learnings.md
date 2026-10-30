# Learnings

## 2026-10-21T16:40+05:30 @claude-sonnet — Score title similarity with trigrams, not word sets. {#L-4cm6v}
- kind: tip
- tags: search, dedupe
- applies_to: `crates/wf-index/**`
- promote: no

Score title similarity with trigram overlap. Treat a score above 0.6 as a duplicate candidate.

Evidence: [[#C-6vs4g]] compared 3 scores on 8 titles.

## 2026-10-22T12:57+05:30 @claude-sonnet — Keep promoted items as drafts until a person reviews them. {#L-8rk5m}
- kind: pattern
- tags: library, review, promote
- applies_to: promote-to-library, curate-library
- promote: candidate

Create every promoted item as a draft. Let only a human review set `reviewed`. Inject reviewed items only.

Evidence: An unreviewed gotcha sent two agents down a dead end in the first week of the dogfood run.
