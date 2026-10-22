# Changes

## 2026-10-15T15:30+05:30 @claude-sonnet — Made the cards draggable {#C-7nh3b}
- kind: progress
- task: T-1
- commit: 30c9ba1
- files: `web/src/features/board/dnd.ts`
- model: claude-sonnet-5-5

Registered each card as a drag source. The drag preview is the card itself.

## 2026-10-17T13:40+05:30 @claude-sonnet — Added drop targets and the accent line {#C-2rw9x}
- kind: progress
- task: T-2
- commit: e92b4d7
- files: `web/src/features/board/KanbanColumn.tsx`
- model: claude-sonnet-5-5

Each column highlights while a card hovers over it. The accent line shows the drop point.

## 2026-10-19T17:10+05:30 @shruti — Checked the column highlight {#C-6cp5k}
- kind: verify
- criteria: SC-3
- result: pass
- evidence: manual check in both themes by @shruti

Dragged a card across all 6 columns in the light and the dark theme. The highlight was visible in both.

## 2026-10-22T10:27+05:30 @claude-sonnet — Rolled the card back on a conflict {#C-9fa8m}
- kind: fix
- task: T-3
- criteria: SC-4
- result: pass
- commit: b7d1e02
- files: `web/src/features/board/useMoveIssue.ts`
- model: claude-sonnet-5-5

Restored the old status when the server answered 409. Showed the toast with the Reapply action.
