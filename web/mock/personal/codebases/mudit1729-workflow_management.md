---
title: workflow_management
kind: codebase
repo: https://github.com/mudit1729/workflow_maagement
ref: main
commit: "a7f905c"
summarized_at: 2026-10-30T16:05+05:30
summarized_by: "@claude-sonnet"
---

## What it is

A clickable prototype of wf, a markdown-first workflow manager for coding agents. Work lives in a workspace of markdown files: an issue is a folder with a `goal.md`, a plan and three logs. A board shows those files, and Codex or Claude Code edit the same files through skills. The web app (React 19, Vite 8, TanStack Router and Query, Tailwind 4, radix, zustand) runs on an in-browser mock of the future `wf serve` API, so no backend exists yet. The repository also holds the `workflow` skills plugin and the planning documents.

## How to run

Commands come from `web/package.json`, `web/vite.config.ts` and the headers of the scripts. This summary did not run them.

```bash
cd web
pnpm install                         # lockfile v9; Node and pnpm versions are not pinned
pnpm dev                             # http://localhost:5177 (strict port); the board starts empty
pnpm typecheck                       # tsc --noEmit
pnpm lint                            # biome check src mock
pnpm exec vitest run                 # all tests; there is no "test" script. Add a path for one file
pnpm build                           # production build; pnpm build:static builds with a hash router
pnpm wf:lint mock/sample             # lint a workspace's markdown (the F and S rules)
node scripts/shot.mjs /w out.png     # screenshot a route of the running dev server (Playwright)
node ../plugins/workflow/scripts/check-skills.mjs   # house rules for every SKILL.md
```

In the browser console, `window.__wf.loadSample()` puts the 26 sample issues on the board and `window.__wf.reset()` clears it.

## Map

| Path | What lives there |
|---|---|
| `.claude-plugin/` | This repository's own Claude marketplace; `.claude-plugin/marketplace.json` lists the `workflow` plugin |
| `.claude/launch.json` | Preview config that starts `pnpm --dir web dev` on port 5177 |
| `docs/plan/` | The product contract (`docs/plan/contract.md`), the handoff, mockups, proposals, research notes and build workflows |
| `plugins/workflow/` | The skills plugin: `plugins/workflow/skills/`, helper scripts and `plugins/workflow/scripts/check-skills.mjs` |
| `scripts/install-skills.sh` | Copies the skills for Codex or Claude Code and prints the plugin commands |
| `web/` | The dashboard prototype and its build contract, `web/UI_BUILD.md` |
| `web/mock/` | The in-browser mock server: store, derivations, ops, the Codex run and the Add work split |
| `web/mock/md/` | The markdown layer: parse frontmatter, sections and entries; lint; minimal text edits |
| `web/mock/sample/` | The sample world, a fixture of 26 issues loaded on demand |
| `web/mock/workspace/` | The shipped workspace: config, authors, glossary, library and groups, with no issues |
| `web/public/diagrams/` | Stand-in HTML previews of the archify diagrams |
| `web/scripts/` | `web/scripts/wf-lint.mjs`, the screenshot and sweep scripts, the diagram preview renderer |
| `web/src/app/` | The shell: router, nav rail, command palette, shortcuts, dev panel |
| `web/src/components/ui/` | Shared primitives (button, dialog, tabs, chip) on radix, restyled to the tokens |
| `web/src/components/common/` | Shared pieces such as `AuthorChip`, `ViewTabs` and `MarkdownProse` |
| `web/src/features/` | One folder per view: board, issue, library, files, skills, add-work, codex, context, diagram, kit |
| `web/src/gen/types.ts` | Hand-written API types, a stand-in for generated ones |
| `web/src/lib/` | The API client and hooks (`web/src/lib/api/`), live updates (`web/src/lib/live/`), navigation, status and formatting |
| `web/src/styles/` | Design tokens (`tokens.css`) and the Tailwind theme (`base.css`) |

## Key flows

### An edit on the board

1. A component calls a mutation hook such as `useToggleCriterion` in `web/src/lib/api/ops.ts`.
2. The hook sends an op through `api.ops` (`web/src/lib/api/client.ts`) to the mock server, `web/mock/server.ts`.
3. `web/mock/ops.ts` finds the target, answers 409 for a stale rev and 422 for an illegal move, then edits the text with `web/mock/md/edit.ts`.
4. `mutate` in `web/mock/store.ts` reloads the edited files with `loadWorkspace` (`web/mock/md/index.ts`) and `web/mock/derive.ts`. It swaps them in only if they load, then emits `delta` and `activity` events.
5. `web/src/lib/live/index.ts` applies each delta to the cached snapshot with `web/src/lib/api/delta.ts`, and the board renders it.

### A file saved while the dev server runs

1. The `workspaceHot` plugin in `web/vite.config.ts` sees a change under `web/mock/workspace` or `web/mock/sample`.
2. It replaces `web/mock/workspace-files.ts` or `web/mock/sample-files.ts`, which hands the new file set to `web/mock/workspace-bus.ts`.
3. The store applies it with `applyChanges`, which names the writer in an activity line and emits the same events as an op. The sample is applied only while it is loaded.

### Do next step

1. `web/src/features/codex` starts a run through `api.startCodexRun`.
2. `web/mock/codex.ts` simulates Codex in phases about two seconds apart: claim the task, log the work, verify with a CI run, finish. Each phase is a real markdown edit through the store, as the `doing-next-step` skill says.
3. Commits, pull requests and CI runs come from `web/mock/fixtures/delivery-sample.json` and from what the run adds (`web/mock/delivery.ts`). They are the one thing not stored as markdown.

### Add work

1. `web/src/features/add-work` asks one question per screen.
2. `api.splitWork` calls `web/mock/work.ts`, which splits the outcome with keyword templates. The same input gives the same proposals.
3. The `create_work` op in `web/mock/ops.ts` writes one `goal.md` for each issue the person keeps.

## Conventions

- Markdown is the only source of mock content. To change what the board shows, edit a file under `web/mock/workspace/`, never a TypeScript object (`web/UI_BUILD.md`).
- Every write is a minimal text edit (`web/mock/md/edit.ts`). Only `current_state.md` and new files are written whole.
- A component root carries `data-wf="<ComponentName>"`, and feedback names components by it.
- Style with token classes such as `bg-subtle`, `text-fg-muted` and `text-status-<status>`. No raw hex colors, and z-index only through the named layers (`z-popover`, `z-dialog`).
- Controls follow the user's order: buttons before multiple choice, multiple choice before drop-downs, drop-downs before typing.
- Handles are stored without `@` and shown with it. In YAML frontmatter they are quoted.
- Feature folders export through `index.ts`. Imports use `@/` for `web/src` and `@mock/` for `web/mock`.
- Biome formats with two spaces and 100 columns, and TypeScript is strict. Tests sit beside the code as `*.test.ts` and `*.test.tsx` (41 files).
- A commit for an issue ends with the trailer `Issue: <id>`.

## Gotchas

- The board starts empty. The sample issues appear only after `loadSample()`, and `reset()` removes them again.
- The sample files are dated 2026-10-22, and the dashboard moves their clock to now. A skill that reads the raw files sees expired leases unless it sets `WF_NOW=2026-10-22T16:27+05:30`.
- There is no `wf` binary yet. `VITE_API=real` proxies `/api` to `127.0.0.1:7777`, where `wf serve` is meant to listen.
- The dev server needs port 5177 (`strictPort`). A second server on the same port fails to start.
- `web/mock/skills.ts` reads `plugins/` and `.claude-plugin/`, which sit above `web/`. That works only because `server.fs.allow` in `web/vite.config.ts` lists the repository root.
- Diagram (archify) blocks show "unavailable" with their JSON, because archify is not installed here. A stand-in preview comes from `web/public/diagrams/`, which `web/scripts/render-diagram-previews.mjs` rewrites when a block changes.
- The hints in the issue views may name only real skills. `WF_SKILLS` in `web/src/features/issue/skill-hint.tsx` must list exactly the folders of `plugins/workflow/skills` (`web/src/features/issue/hints.test.ts`).
- Keep every chunk under the 500 kB warning. The mock server and the diagram card are dynamic imports, and so are the issue views, Add work and Skills (`web/src/app/lazy-views.tsx`).
- `docs/plan/contract.md` wins when it disagrees with `web/UI_BUILD.md`.

## Where to start

1. `web/UI_BUILD.md`: the build contract with naming, routes, ground rules and the module map.
2. `docs/plan/HANDOFF.md`: what exists, what was decided and what is still open.
3. `web/mock/store.ts`: the in-memory workspace that every read and write passes through.
4. `web/src/app/router.tsx`: every route and the view it renders.
5. `plugins/workflow/skills/using-wf/SKILL.md`: how a skill finds the workspace and edits its files.
