---
updated_at: 2026-10-12T14:00+05:30
updated_by: "@shruti"
revision: 1
---

## Approach

Write the quickstart first, because it tests the CLI the way a new user does. Write one page per file of the issue folder, then check every command in CI.

## Phase 1: Draft

### T-1: Write the quickstart
- status: done
- lane: docs
- owns: `docs/user/quickstart.md`
- satisfies: SC-1
- assignee: @shruti
- claimed_by: @shruti
- verify: manual

Walk from `wf init` to `wf verify` on one criterion. Keep the page under 400 words.

### T-2: Write the issue anatomy page
- status: in_progress
- lane: docs
- depends_on: T-1
- owns: `docs/user/anatomy.md`
- satisfies: SC-2
- assignee: @shruti
- verify: manual

Show one real example of `goal.md`, `plan.md`, `current_state.md` and the three logs.
- [x] Show `goal.md` and `plan.md`.
- [ ] Show `current_state.md`.
- [ ] Show the three logs.

### T-3: Check every command against the golden workspace
- status: todo
- lane: docs
- depends_on: T-2
- owns: `docs/user/check.sh`
- satisfies: SC-3
- assignee: @shruti
- verify: `just docs-check`

Extract each `wf` command from the pages and run it in a temp copy of the golden workspace.
