---
id: lib-5cw1e
title: Review promoted items before agents read them
kind: pattern
description: Use when you promote a learning or decision. Keep it a draft until the group owner reviews it.
status: draft
tags: [library, review, promote]
applies_to: [promote-to-library, curate-library]
source:
  - "[[wf-x5hd3#L-8rk5m]]"
authors: ["@claude-sonnet"]
created: 2026-10-22
review_after: 2027-04-20
---

## Rule

A promoted item starts as `draft`. Only a human review sets `reviewed`. `wf context` injects reviewed items only.

## When to use

Every promotion from `learnings.md` or `decisions.md`.

## Example

`wf promote wf-x5hd3#L-8rk5m --kind pattern` creates this draft and asks @shruti to review it.

## Evidence

- [[wf-x5hd3#L-8rk5m]]: an unreviewed gotcha sent two agents down a dead end.
