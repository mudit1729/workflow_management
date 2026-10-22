---
updated_at: 2026-10-20T16:27+05:30
updated_by: "@claude-sonnet"
revision: 2
---

## Approach

Build the promote and approve ops in `wf-edit` first, because both the CLI and the web UI call them. Build the dialog next. Filter drafts out of the context bundle last, because that file has a live lease.

## Assumptions

- A1: The group owner reads a review request within a day. [open]
- A2: A trigram score on titles finds near duplicates. [confirmed]

## Phase 1: Promote and approve

### T-1: Create the draft with a source backlink
- status: done
- lane: core
- owns: `crates/wf-edit/src/promote.rs`
- satisfies: SC-1
- assignee: role:backend
- claimed_by: @codex
- verify: `cargo test -p wf-edit promote_creates_draft`

Write `library/<kind>s/<slug>.md` with `status: draft` and a `source:` list. Take the kind from the entry.
- [x] Pick the library kind from the entry kind.
- [x] Write the draft file under the lock.

### T-2: Approve a draft
- status: done
- lane: core
- depends_on: T-1
- owns: `crates/wf-edit/src/approve.rs`
- satisfies: SC-4
- assignee: role:backend
- claimed_by: @claude-sonnet
- verify: `cargo test -p wf-edit approve_sets_reviewed`

Set `status: reviewed`, `reviewed_by` and `last_reviewed` in one splice.

## Phase 2: Review flow

### T-3: Build the promote dialog
- status: in_progress
- lane: web
- depends_on: T-1
- owns: `web/src/features/library/PromoteDialog.tsx`
- satisfies: SC-3
- assignee: role:frontend
- claimed_by: @shruti
- lease_until: 2026-10-22T17:17+05:30
- verify: manual

Show the kind, the slug and a preview of the draft. Show `Similar: lib-…` when the title score passes 0.6.
- [x] Show the kind and the slug.
- [x] Show the preview of the draft.
- [ ] Show the merge suggestion.

### T-4: Leave drafts out of the context bundle
- status: todo
- lane: core
- depends_on: T-1
- owns: `crates/wf-cli/src/context/select.rs`
- satisfies: SC-2
- assignee: role:backend
- verify: `cargo test -p wf-cli context_skips_drafts`

Skip every library item that is not `reviewed` when the bundle picks items. [[wf-t3jp5]] holds the lease on the context folder.

### T-5: Open a review request on promote
- status: todo
- lane: core
- depends_on: T-1
- owns: `crates/wf-edit/src/review_request.rs`
- satisfies: SC-1
- assignee: role:backend
- verify: `cargo test -p wf-edit promote_asks_owner`

Append a `Q-` request for the group owner to `current_state.md` of the source issue. Link the draft in `ref:`.
