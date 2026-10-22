---
id: lib-k2s7b
title: Write criteria as EARS sentences
kind: playbook
description: Use when you write or review `## Success criteria` in goal.md.
status: draft
tags: [ears, criteria, writing]
applies_to: [goal.md, write-goal]
source:
  - "[[wf-b1d7v#L-2pn6j]]"
authors: ["@claude-opus"]
created: 2026-10-20
review_after: 2027-04-18
---

## Overview

Each criterion is one EARS sentence that a command or a named human can check.

## Procedure

1. Start with the trigger: `When`, `While`, `If` or `Where`.
2. Name the system, then write `shall`.
3. Put a number with a unit or a backticked literal in the response.
4. Add `verify:` with a command, or `manual`.

## Done when

`wf lint goal.md` reports no S07 and no S08.

## Forbidden

- `should`, `fast`, `reliable` and other words that a test cannot check.
