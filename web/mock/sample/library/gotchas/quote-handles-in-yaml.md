---
id: lib-9vk2w
title: Quote handles in YAML frontmatter
kind: gotcha
description: Use when you write `owner`, `claimed_by` or `authors` in frontmatter. A bare `@handle` breaks the YAML.
status: reviewed
tags: [yaml, frontmatter, authors]
applies_to: [goal.md, plan.md, current_state.md]
source:
  - "[[wf-m3tq8#L-4dz9w]]"
authors: ["@codex"]
reviewed_by: "@shruti"
created: 2026-10-13
last_reviewed: 2026-10-14
review_after: 2027-04-11
---

## Symptom

`wf lint` reports F001 on `owner: @shruti`. The board shows the issue with a red lint dot.

## Cause

`@` is a reserved indicator in YAML. A plain scalar cannot start with it.

## Fix

Quote the handle: `owner: "@shruti"`.

## Evidence

- [[wf-m3tq8#L-4dz9w]]: three goal.md files broke the same way in one day.
