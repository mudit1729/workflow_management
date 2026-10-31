---
title: Agent-readable issue context
kind: topic
status: active
question: How much context does an agent need to resume an issue cold?
tags: [agents, context, handoff]
updated: 2026-10-30
sources:
  - https://arxiv.org/abs/2307.03172
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://research.trychroma.com/context-rot
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
---

## Summary

A cold agent needs the goal, the criteria and the one-line state first, then only what its next task touches. The handoff bundles of the 26 sample issues are 303 to 1,989 tokens, far below the 6,000-token budget, so the order of the sections matters more than the size. What is still open is how much of the log is worth including.

## Findings

- Models use the start and the end of a long input better than its middle, so the goal comes first and the next steps last. [Lost in the Middle](https://arxiv.org/abs/2307.03172)
- Recall falls as the window fills, for every model tested. A bundle should be the smallest set of text that still says what to do. [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [Context Rot](https://research.trychroma.com/context-rot)
- Between sessions, the handoff that works is files: a progress file and the git log, read first. [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- wf bundles are small. The largest sample bundle is 1,989 tokens and the median 804. See [[topics/agent-context/bundle-sizes]].
- The Now line of the card is what a resuming agent reads before anything else, so it says the next action, not the history. See [[topics/agent-context/resume-points]].

## Open questions

- How many log entries does a resume need? The bundle takes the last 5.
- Does the architecture diagram in a goal help an agent more than the paragraph beside it? The bundle keeps a one-line stub of it today.
- Should the bundle say which sections it left out when the budget cuts?

## Notes

- [[topics/agent-context/resume-points]]: what the card has to say when it moves.
- [[topics/agent-context/bundle-sizes]]: how large the bundles are, section by section.

## Background

An hour on how large language models work, as background for this topic.

[Intro to Large Language Models, by Andrej Karpathy](https://youtu.be/zjkBMFhNj_g)
