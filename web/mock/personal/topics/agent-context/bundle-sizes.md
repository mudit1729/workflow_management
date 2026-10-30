---
title: Bundle sizes
kind: note
topic: agent-context
updated: 2026-10-30
author: "@shruti"
---

How large is the handoff bundle of an issue? I measured the 26 sample issues with the mock `context` endpoint. Tokens are characters divided by 4, the rule the budget itself uses.

| | Tokens |
|---|---|
| Smallest | 303 |
| Median | 804 |
| Largest | 1,989 |
| Budget | 6,000 |

No sample bundle comes near the budget. It starts to bind only with many linked library items or long logs, and the sample has neither. The defaults keep it in check: 5 log entries and 3 library items (`[context]` in `workflow.toml`).

Here is the bundle of `wf-3k9x2`, section by section. It is the second largest, at 1,930 tokens.

![Copy context on wf-3k9x2: the sections of its bundle add up to 1,930 of 6,000 tokens](media/context-bundle.webm)

## What is large

- Linked context, 397 tokens. It holds the full text of the linked library items.
- Git, PRs and CI, 340 tokens. Every commit, pull request and CI run is a line.
- Current state, 311 tokens.

## Caveat

The sample issues are short. A real issue with a month of log entries will be larger, and the numbers above say nothing about how well an agent resumes from them. That needs a trial: resume ten issues cold from bundles of 1k, 2k and 6k tokens and compare.
