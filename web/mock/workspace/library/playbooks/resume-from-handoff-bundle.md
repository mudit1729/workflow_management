---
id: lib-6pm4c
title: Resume an issue from the handoff bundle
kind: playbook
description: Use when you start a fresh session on an issue that another agent worked on. Read the bundle, not the whole folder.
status: reviewed
tags: [handoff, context, session]
applies_to: [resume-issue]
source:
  - "[[wf-b1d7v#L-5vz3k]]"
authors: ["@claude-opus"]
reviewed_by: "@shruti"
created: 2026-09-22
last_reviewed: 2026-10-10
review_after: 2027-03-21
---

## Overview

A fresh session reads `wf context` first. The bundle holds the current state, the open criteria, the ready tasks and the last 5 changes within 6000 tokens.

## Procedure

1. Run `wf context <issue>`.
2. Read `## Needs you` and stop if a blocking request is open.
3. Run `wf next --issue <issue> --claim`.
4. Read the brief of the claimed task.
5. Read the files in `owns` only.

## Done when

You hold one live lease and you can name the next step of `current_state.md`.

## Forbidden

- Reading every file of the issue folder.
- Editing a file that another live lease owns.
