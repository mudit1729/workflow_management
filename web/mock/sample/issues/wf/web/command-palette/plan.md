---
updated_at: 2026-10-05T11:00+05:30
updated_by: "@claude-sonnet"
revision: 1
---

## Approach

Build the palette on cmdk. Search through `/api/search` and group the results by kind. Add the actions last.

## Phase 1: Palette

### T-1: Build the palette shell
- status: done
- lane: web
- owns: `web/src/app/CommandPalette.tsx`
- satisfies: SC-1
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: `pnpm -C web test palette-open`

Open a dialog with cmdk on `⌘K` and close it on `Esc`.

### T-2: Wire the server search
- status: done
- lane: web
- depends_on: T-1
- owns: `web/src/lib/api/search.ts`
- satisfies: SC-2, SC-3
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: `pnpm -C web test palette-search`

Call `useSearch` while the user types. Group the hits by kind.

### T-3: Add the actions group
- status: done
- lane: web
- depends_on: T-1
- owns: `web/src/app/palette-actions.ts`
- satisfies: SC-1
- assignee: @claude-sonnet
- claimed_by: @claude-sonnet
- verify: manual

List the actions: new issue, switch theme, go to the inbox.
