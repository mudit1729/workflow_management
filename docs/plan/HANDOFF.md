# Handoff: wf dashboard UI prototype (2026-10-22, evening)

The user asked for a clickable prototype of every UI element, on mock data, to review element by
element. It is built, reviewed, verified and published.

- Live, clickable: https://claude.ai/artifact/JBq4MmtyBHh3DxuNLVJgw9 (private to the user; static build).
- Final screenshots: `docs/plan/mockups/shots/` (17 PNGs).
- Build contract and current architecture: `web/UI_BUILD.md`. Product contract: `docs/plan/contract.md`.

## Decisions the user made in this session

1. **Markdown-first.** "Make sure everything is based in markdown; any addition to markdown changes stuff."
   `web/mock/workspace/**` is the only source of mock content (workflow.toml, authors.md, glossary.md,
   issues/**, library/**). The parser in `web/mock/md/` follows contract §1.3–1.7; lint is computed from
   the text. Every UI write and scripted live event is a minimal text edit (`web/mock/md/edit.ts`). In the
   dev server, saving a file under `web/mock/workspace/` updates the board through HMR. In the browser,
   Workdatabase · Files edits any file. Recorded timestamps are shifted to "now" at load (`RECORDED_AT`).
2. **Naming.** Workspace (container) → **Workflow** (Board · Inbox) and **Workdatabase**
   (Library · Glossary · Files). URLs are unchanged; `/glossary` is new; shortcuts `g w`, `g d`, `g g`.
3. **New issue context.** The New issue dialog has Context (→ `## Context`) and a "Context from
   Workdatabase" picker (library items, glossary terms, files, decisions) written to `## Links`. The Goal
   tab can add context later; the `wf context` bundle puts linked items first.
4. **Library is a markdown-grounded HTML viewer.** Library items render from their file in file order,
   with Rendered | Source, file:line on hover, and inline Edit.
5. **Archify** is not installed in the cloud, so diagrams ship as "unavailable" with their JSON sources
   (user instruction). A prototype button on the card, or the DevPanel switch, shows a stand-in preview.

## Open items for the user

- `docs/plan/proposals/contract-1.12-tokens.md`: the token changes the UI now ships (contrast fixes,
  hues 6 and 8, scrim, z layers, text tokens). The contract is unchanged until the user approves.
- The contract does not yet name the Workflow / Workdatabase views (only `web/UI_BUILD.md` does).
- The plan sections §1–§17 are written by another session into `docs/plan/parts/` and
  `docs/plan/diagrams/`. Do not create or edit those here.

## How the user gives feedback

Every component root carries `data-wf="<ComponentName>"`; the Kit (`/kit`) shows each element with its
variants and a "Copy feedback ref" button. Feedback arrives as "ElementName: change". Apply it to that
component, keep the Kit in sync, re-screenshot, and republish.

## How to run and publish

- `pnpm --dir web install`, `pnpm --dir web dev` (port 5177). Checks: `pnpm -s typecheck`,
  `pnpm -s exec biome check src mock`, `pnpm exec vitest run` (460 tests), `pnpm -s build`.
- Screenshots: `node web/scripts/shot.mjs <route> <png>` (one page, clicks) and
  `node web/scripts/sweep.mjs --out <dir> --sheets` (every route × width × theme, with contact sheets).
  Both fall back to the system Chromium at `/opt/pw-browsers/chromium` in cloud containers.
- Publish: `pnpm --dir web build:static`, strip doctype/html/head/body from `dist-static/index.html`
  for the artifact page, pass every other file of `dist-static/` as supporting files, and escape literal
  U+FFFD characters in JS (the publisher rejects them) as `�`.

## Workflow scripts used

`docs/plan/workflows/wf-ui-build.js` and `wf-ui-review.js` hold the original builder and reviewer
prompts. In the cloud the container has 4 CPUs, so each workflow runs 2 agents at a time; this session
ran several workflows side by side (builders, audits, markdown-first, feedback round 1, review, fixers,
verify), each agent owning disjoint files.
