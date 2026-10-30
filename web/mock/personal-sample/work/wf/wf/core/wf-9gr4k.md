---
title: Lint glossary synonyms (S09)
kind: issue-summary
issue: wf-9gr4k
workspace: wf
group: wf/core
status: review
rev: "b4a2120"
summarized_at: 2026-10-30T16:20+05:30
summarized_by: "@claude-sonnet"
---

## Where it stands

S09 rule passes its tests; @shruti reviews the new library draft. 3 of 3 criteria are verified.

## Done so far

- Promoted L-3nz8w to the draft lib-7nq3d · [[wf-9gr4k#C-5mx9a]]
- Tested S09 on the dogfood workspace · `b20f7a4` · [[wf-9gr4k#C-8tv2c]]
- Matched avoided words on word boundaries · `6e1c8d5` · [[wf-9gr4k#C-3qy7n]]

## Decisions

None.

## Learnings

- [[wf-9gr4k#L-3nz8w]] Match glossary synonyms on whole words, never on substrings.
- [[wf-9gr4k#L-6fp2t]] Mask code spans before you lint prose.

## Next

1. Wait for the review of [[wf-9gr4k#T-3]] by @mudit.
2. Move the issue to done after the review and the answer to [[wf-9gr4k#Q-3bw7m]].
