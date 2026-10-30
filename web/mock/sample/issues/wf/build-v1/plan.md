---
updated_at: 2026-10-22T07:27+05:30
updated_by: "@claude-opus"
revision: 4
---

## Approach

Build v1 in four phases. The format and the index land first, because every other part reads them. The daemon and the CLI follow. The web UI and the skills then run in parallel on the mock server and the fixtures. The release phase starts when the other phases are done.

## Assumptions

- A1: `cargo test --workspace` stays under 90 s in CI. [confirmed]
- A2: The skills need no change after the format freezes. [open]
- A3: Dogfooding finds the last format gaps before the release. [open]

## Prior art

- [[lib-6pm4c]]: start every agent session from the handoff bundle.

## Phase 1: Format and index

### T-1: Freeze wf_format 1
- status: done
- lane: core
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @mudit
- verify: `cargo test -p wf-parse golden`

Write the grammar into `spec/format.md`. Cover every file type with a golden fixture.
- [x] Write `spec/format.md`.
- [x] Add one golden fixture per file type.

### T-2: Ship the index and the watcher
- status: done
- lane: core
- depends_on: T-1
- satisfies: SC-2
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-index`

Scan the workspace into a snapshot and keep it current from watcher events.

## Phase 2: Daemon and CLI

### T-3: Ship the write protocol
- status: done
- lane: server
- depends_on: T-2
- satisfies: SC-3
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-server write_conflict`

Lock the file, check the `base_rev`, splice one value and write the file atomically.

### T-4: Ship the context bundle
- status: in_progress
- lane: core
- depends_on: T-2
- satisfies: SC-5
- assignee: role:backend
- claimed_by: @mudit
- lease_until: 2026-10-22T17:22+05:30
- verify: `cargo test -p wf-cli context_budget`

Land [[wf-t3jp5]]. The bundle must fit the budget and must keep `## Needs you` and `## Next steps`.
- [x] Count tokens in the bundle.
- [ ] Trim the bundle in a fixed order.

## Phase 3: Board and skills

### T-5: Ship the board and the drawer
- status: in_progress
- lane: web
- depends_on: T-3
- satisfies: SC-4
- assignee: role:frontend
- claimed_by: @shruti
- lease_until: 2026-10-22T17:09+05:30
- verify: manual

Build every element of the board, the drawer, the library and the inbox on the mock server. Live updates come from [[wf-3k9x2]].
- [x] Build the board and the cards.
- [x] Build the drawer tabs.
- [ ] Build the library and the inbox.

### T-6: Ship the skills and hooks
- status: todo
- lane: skills
- depends_on: T-1
- satisfies: SC-6
- assignee: role:skills
- verify: manual

Write the 14 skills of the three plugins and the `SessionStart` hook. [[wf-skf01]] draws the flowchart.

## Phase 4: Release

### T-7: Cut v0.1 and dogfood the build
- status: todo
- lane: release
- depends_on: T-4, T-5, T-6
- satisfies: SC-7
- assignee: @mudit
- verify: `just dogfood-lint`

Tag v0.1 through [[wf-g5rx8]]. Run `wf lint --strict` on the dogfood workspace.
