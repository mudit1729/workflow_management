---
id: wf-b1d7v
title: Build v1
status: in_progress
priority: high
size: l
owner: "@mudit"
labels: [milestone]
claimed_by: "@claude-opus"
lease_until: 2026-10-22T17:15+05:30
blocked_by: []
due: 2026-10-31
created: 2026-08-22T10:05+05:30
---

## Context

wf v1 is the first version that a team can run on its own repo. It holds the file format, the Rust daemon, the CLI, the web UI and the skills. The team builds v1 inside wf, so this folder is also the main example of the format.

This issue tracks the whole build. Each group lead links the issues that block the release, and the coordinator keeps the plan and the state current. Read `current_state.md` first. It names the one next action.

## Success criteria

- [x] SC-1: When a user runs `wf init` in an empty git repo, the CLI shall create a workspace that `wf lint` accepts.
  - verify: `cargo test -p wf-cli init_lints_clean`
  - evidence: `cargo test -p wf-cli init_lints_clean` passed at `7c2e9d4`, see [[#C-6hx3q]]
  - verified_by: @codex
- [x] SC-2: When a file in the workspace changes, the daemon shall rebuild the affected roll-ups within 500 ms.
  - verify: `cargo test -p wf-index rollup_latency`
  - evidence: `cargo test -p wf-index rollup_latency` passed at `e41b8a7`, see [[#C-9rm5t]]
  - verified_by: @mudit
- [x] SC-3: If a write conflicts with a newer edit, then the daemon shall refuse the write and return the current value.
  - verify: `cargo test -p wf-server write_conflict`
  - evidence: `cargo test -p wf-server write_conflict` passed at `2fa90c6`, see [[#C-4zp7d]]
  - verified_by: @codex
- [ ] SC-4: The web UI shall show every issue, group and open request of the workspace.
  - verify: manual
- [ ] SC-5: When an agent runs `wf context` on an issue, the CLI shall print a bundle of at most 6000 tokens.
  - verify: `cargo test -p wf-cli context_budget`
- [ ] SC-6: When an agent starts a session on an issue, the `resume-issue` skill shall load the context bundle first.
  - verify: manual
- [ ] SC-7: The release shall pass `wf lint --strict` on the dogfood workspace.
  - verify: `just dogfood-lint`

## Out of scope

- Two-way sync with GitHub, Jira or Linear. See [[wf-n7vy3]].
- Login and roles. See [[wf-ss0lo]].
- More than one workspace per daemon.

## Links

- [[wf-3k9x2]]: live board updates.
- [[wf-t3jp5]]: the context bundle within the token budget.
- [[wf-g5rx8]]: the v0.1 release.
- [[lib-6pm4c]]: how an agent resumes an issue.
