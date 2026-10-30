---
id: wf-g5rx8
title: Cut the v0.1 release
status: planned
priority: urgent
size: m
owner: "@mudit"
labels: [release]
blocked_by: []
due: 2026-10-24
created: 2026-10-17T10:40+05:30
---

## Context

v0.1 is the first tagged build that outside testers can install. It needs a signed binary for each platform, release notes and a Homebrew formula. The tag is due in 2 days, and nobody has run the release flow end to end yet.

## Success criteria

- [ ] SC-1: When a maintainer pushes the tag `v0.1.0`, CI shall build binaries for macOS and Linux.
  - verify: `just release-dry-run`
- [ ] SC-2: The release notes shall list every issue that closed since the last tag.
  - verify: manual
- [ ] SC-3: When a user runs `brew install wf`, the formula shall install `wf` and `wf-server`.
  - verify: manual

## Out of scope

- A Windows build. The first testers use macOS and Linux.
- Auto-update inside the binary.

## Links

- [[wf-b1d7v]]: Build v1, task T-7 cuts v0.1.
