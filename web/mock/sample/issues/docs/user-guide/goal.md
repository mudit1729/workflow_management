---
id: wf-a7ne5
title: Write the user guide
status: in_progress
priority: low
size: m
owner: "@shruti"
labels: [docs]
blocked_by: []
created: 2026-10-10T11:30+05:30
---

## Context

New users meet wf through the README and the skills. They need one guide that walks them from `wf init` to their first verified criterion in 20 minutes.

The guide lives in `docs/user/` and every command in it runs against the golden workspace.

## Success criteria

- [ ] SC-1: When a new user follows the quickstart, the user shall reach a verified criterion within 20 min.
  - verify: manual
- [ ] SC-2: The guide shall show one example of each file in an issue folder.
  - verify: manual
- [ ] SC-3: Every command in the guide shall run against the golden workspace.
  - verify: `just docs-check`

## Out of scope

- A reference for every CLI flag. `wf --help` covers it.
- Video tutorials.
