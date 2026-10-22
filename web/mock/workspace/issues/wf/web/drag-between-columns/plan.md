---
updated_at: 2026-10-14T10:00+05:30
updated_by: "@claude-sonnet"
revision: 1
---

## Approach

Use pragmatic-drag-and-drop for the drag source and the drop targets. Send each drop through `useMoveIssue`, so the gate dialog and the rollback stay in one place.

## Phase 1: Drag

### T-1: Make the cards draggable
- status: done
- lane: web
- owns: `web/src/features/board/dnd.ts`
- satisfies: SC-1
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: `pnpm -C web test dnd-move`

Register each card as a drag source with its issue ID.

### T-2: Add drop targets and the indicator
- status: done
- lane: web
- depends_on: T-1
- owns: `web/src/features/board/KanbanColumn.tsx`
- satisfies: SC-3
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: manual

Highlight the column under the pointer and draw a 2 px accent line at the drop point.

### T-3: Handle the gate and the rollback
- status: review
- lane: web
- depends_on: T-2
- owns: `web/src/features/board/useMoveIssue.ts`
- satisfies: SC-2, SC-4
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: `pnpm -C web test dnd-rollback`

Open the gate dialog for an illegal move. Roll the card back when the server answers 409.
- [x] Open the gate dialog for an illegal move.
- [x] Roll the card back on a 409.
