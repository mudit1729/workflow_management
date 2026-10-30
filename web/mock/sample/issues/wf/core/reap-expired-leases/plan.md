---
updated_at: 2026-10-22T12:57+05:30
updated_by: "@codex"
revision: 1
---

## Approach

Compute the lease state in the index, then let a timer in the daemon release claims that stay expired past the grace period. Show the grace period on the board card.

## Assumptions

- A1: A 15 min grace period covers an agent restart. [confirmed]

## Phase 1: Detect and release

### T-1: Compute the lease state in the index
- status: done
- lane: core
- owns: `crates/wf-index/src/lease.rs`
- satisfies: SC-2
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-index lease_state`

Return `none`, `live` or `expired` from `claimed_by` and `lease_until`.

### T-2: Release expired claims after the grace period
- status: in_progress
- lane: core
- depends_on: T-1
- owns: `crates/wf-index/src/reap.rs`
- satisfies: SC-1, SC-3
- assignee: role:backend
- claimed_by: @codex
- lease_until: 2026-10-22T17:00+05:30
- verify: `cargo test -p wf-index reap_after_grace`

Run a timer every minute. Clear `claimed_by` and `lease_until`, set the task to `todo` and append a change entry.
- [x] Add the minute timer.
- [x] Clear the claim under the file lock.
- [ ] Append the change entry.

### T-3: Show the grace period on the board card
- status: in_progress
- lane: web
- depends_on: T-1
- owns: `web/src/features/board/LeaseBadge.tsx`
- satisfies: SC-2
- assignee: role:frontend
- claimed_by: @claude-sonnet
- lease_until: 2026-10-22T15:52+05:30
- verify: manual

Show `lease expired 12m ago` in amber on the card until the reaper frees the task.
- [x] Read `lease` from the task summary.
- [ ] Show the amber badge with the time.
