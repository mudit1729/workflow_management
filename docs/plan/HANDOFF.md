# Handoff: wf dashboard UI prototype (2026-10-22)

The user asked to "build the UI elements so that I can keep giving feedback regarding that",
then to run agents at full speed, route work to **Sonnet and Haiku agents**, and continue in the cloud.

## Where things are

- Product contract (frozen): `docs/plan/contract.md`. Research inputs: `docs/plan/research/`.
- UI build contract: `web/UI_BUILD.md` — file ownership per module, every component API, the mock world ids.
  Read it before touching `web/`. Ignore the "Orchestrator note" at its top (it was for a run that has stopped).
- Foundation (done, compiles): `web/src/gen/types.ts` (API/SSE types per contract 1.10),
  `web/src/lib/{cn,status,format,hooks,nav,prefs}.ts`, `web/src/styles/{tokens,base}.css` (tokens per 1.12;
  author/group hues validated with the dataviz palette validator), configs, `index.html` (pre-paint theme).
- Screenshot helper: `node web/scripts/shot.mjs <route> <out.png> [--w 1680] [--theme dark] [--click sel]`
  (needs the dev server on :5177 and Playwright Chromium: `pnpm --dir web exec playwright install chromium`).
- Workflow scripts used so far: `docs/plan/workflows/wf-ui-build.js` (10 builders → integrate → smoke + kit)
  and `docs/plan/workflows/wf-ui-review.js` (3-lens review → per-area fixers → verify).

## State of the parallel build when it stopped (interrupted mid-run, no builder had reported)

| builder | owns | state on disk |
|---|---|---|
| ui-common | `web/src/components/{ui,common}/**` | files present, looks complete — verify |
| shell | `web/src/main.tsx`, `web/src/app/**` | files present — verify |
| board | `web/src/features/board/**` | files present — verify |
| issue-frame / now-goal / plan / log | `web/src/features/issue/**` | all files present — verify |
| data | `web/mock/**`, `web/src/lib/{api,live}/**` | PARTIAL: authors, groups, glossary, library, derive, ears, source, serialize, time, util and the rich issue `wf-3k9x2` exist. MISSING: `mock/server.ts`, `mock/events.ts`, the ~20 other issues, and all of `src/lib/api/**` and `src/lib/live/**` |
| diagram | `web/src/features/diagram/**`, `web/mock/diagrams.ts`, `web/public/diagrams/**` | NOT STARTED |
| library-inbox | `web/src/features/{library,inbox}/**` | NOT STARTED |
| kit | `web/src/features/kit/**` | placeholder only |

The app does not compile yet: `@/lib/api`, `@/lib/live`, `@/features/{diagram,library,inbox}` are missing.

## What to do next (in order)

1. Finish the missing builders in parallel with **Sonnet** agents, using the builder prompts in
   `docs/plan/workflows/wf-ui-build.js` (keys `data`, `diagram`, `library-inbox`), told to continue from the
   files already on disk. The diagram builder needs the archify skill (`~/.claude/skills/archify`); if it is
   not available in the cloud, ship `DIAGRAMS` with `status: "unavailable"` and the JSON sources, and keep
   the ArchifyCard states working.
2. Integrate with one **Sonnet** agent: `pnpm -s typecheck`, `pnpm -s exec biome check --write src mock`,
   `pnpm -s build` all clean; wire gaps between modules.
3. In parallel: a **Haiku** smoke sweep (screenshots of every route, light/dark, 1440/1680/390, report
   runtime errors and broken layouts) and a **Sonnet** kit builder (`/kit` gallery, every element with
   variants, "why it earns its place", light/dark side by side).
4. Run `wf-ui-review.js` with reviewers and fixers on **Sonnet**, verify on **Sonnet**, mechanical sweeps
   on **Haiku**.
5. Publish the static build so the user can click through it from any device:
   `pnpm --dir web build:static` (hash router, base `./`), then republish to the existing artifact
   https://claude.ai/artifact/JBq4MmtyBHh3DxuNLVJgw9 (currently a hand-made clickable mockup whose source is
   `docs/plan/mockups/board-drawer.html`). Strip doctype/html/head/body from the built `index.html`
   for the artifact page and pass the JS/CSS/font/diagram files through `files`.

## How the user gives feedback

Every component root carries `data-wf="<ComponentName>"`. The user names an element and what to change
(e.g. "IssueCard: hide the id"). Apply it to that component, keep the Kit in sync, re-screenshot.
Their early reactions so far: they wanted to see something quickly, and wanted clicks to work.

## Open items for the user

- `docs/plan/contract.md` on disk is an older wording than the version the user pasted in chat (same
  meaning; the pasted one is more plain-English). Both contain a typo in goal.md frontmatter:
  `claimead_by` should be `claimed_by` (Part 2 uses `claimed_by`). Ask before rewriting the contract.
- The plan sections §1–§17 are being written by another local session ("Workspace project management dashboard")
  into `docs/plan/parts/` and `docs/plan/diagrams/` on the user's Mac. They were still in progress at push time,
  so they are NOT in this repo yet. Do not recreate them in the cloud; that session will add them.
