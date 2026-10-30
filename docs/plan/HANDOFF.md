# Handoff: wf dashboard UI prototype (2026-10-30, Codex workflow integrated)

The user asked for a clickable prototype of every UI element, on mock data, to review element by
element. The prototype is now also a workflow manager for Codex. Four UI workstreams (issue
sections, nav and skills, Add work, Codex buttons) were built against one data layer and have been
integrated; this file says what exists, what was decided and what is open.

- Build contract and current architecture: `web/UI_BUILD.md`. Product contract: `docs/plan/contract.md`
  (not edited; see "Open items"). The plan this work follows: `docs/plan/proposals/codex-workflow-plan.md`.
- The last published artifact (https://claude.ai/artifact/JBq4MmtyBHh3DxuNLVJgw9, private to the user) is the
  2026-10-22 build. **It has not been republished with any of the changes below.**
- Screenshots of the earlier build: `docs/plan/mockups/shots/` (17 PNGs). None were regenerated in this pass.

## The user's three goals and where each one lives

1. **Distribute skills and plugins across the team.** The plugin `plugins/workflow/` (Claude marketplace
   `.claude-plugin/marketplace.json`; `scripts/install-skills.sh --codex` copies the skills to `.agents/skills/`) and the
   Workdatabase · Skills view (`/skills`, `g s`) that lists them with their install commands.
2. **Hand anyone the full context of an issue.** Eight issue tabs (Now, Goal, Criteria, Plan, Log, Git, CI, Files), the
   **Open in Codex** button (copies a `codex "Work on wf-xxxxx …"` command and shows the exact prompt), and the `handing-off` skill.
3. **Keep issues and tasks traceable.** Task ↔ commit ↔ CI run: the Git and CI tabs derive from commits that carry the trailer
   `Issue: wf-xxxxx` (or a branch `wf-xxxxx/…`); a Codex run writes the task, the change entry, the commit and the CI run, every
   one visible as a markdown diff.

The user's words for the UI, which the build follows: "you click buttons, which are preferred over MCQ which are preferred over
drop down menus which are preferred over writing text"; "a way to open the codex in a button form / additionally have a button beside it
which in the background does the next step"; "the ui should be usually without going to codex, codex should be able to replicate the flow
with a set of skills without coming to the ui and the ui should be able to work with it also".

## What exists now

- **Naming.** Workspace → **Workflow** (Board, with a Needs you filter) and **Workdatabase** (Library · Glossary · Files · Skills). Shortcuts
  `g w`, `g d` or `g l`, `g g`, `g f`, `g s`, `g k`; `n` opens Add work. There is **no inbox**: `/inbox` redirects to `/w?needs=me`.
- **Board.** Toolbar with **Needs you** (a toggle with the count of open requests; `?needs=me`) and the primary **+ Add work**. A card shows a
  Codex mark while a run goes on its issue; its menu has Open in Codex and Do next step.
- **+ Add work** (`web/src/features/add-work`). One question per screen. Group path: What → Where → Outcome (the one typed line) → Name → Size →
  Priority → Context → **Codex splits it**. The split screen also keeps or drops each proposal, asks **Backlog or Planned** (keys `1` and `2`) and its
  button adds the issues, so **a group takes 8 clicks, the opening click included, and one typed line** (checked with Playwright; a unit test pins the number).
  A single issue has its own short path with a Review screen.
- **Issue tabs 1 to 8** in the drawer and on the narrow page; three columns on the wide page: `[Now + Goal] | [Plan + Criteria] | [Log · Git · CI]`.
  Criteria moved out of Goal into its own tab; `[[#SC-n]]` links go to it.
- **Open in Codex / Do next step** (`web/src/features/codex`). The run is simulated in the prototype, but each phase is a real markdown edit
  (claim the task, log a change, verify with a CI run, finish the task and `current_state.md`, add a commit). The same code path serves the
  issue header, the card menu and the palette, so a run gives **exactly one toast, when it ends**, whichever started it. While a run goes the
  Q005 "current_state is behind" signal is held back (the log is ahead of `current_state.md` on purpose), so the tabs do not move.
- **Skills** (`web/src/features/skills`, `plugins/workflow/skills/*`): `using-wf`, `adding-work`, `planning-issues`, `doing-next-step`,
  `logging-work`, `checking-status`, `handing-off`, `writing-readable-bulk-text`. They edit the same markdown, so Codex or Claude can run the
  whole flow without the UI and a UI edit is just a file for the next skill run. `pnpm wf:lint <workspace>` checks a workspace.
- **Data layer** (`web/src/lib/api`, `web/mock`): `useDelivery`, `useSplitWork`, `useCreateWork`, `useCodexRuns`, `useStartCodexRun`, `codexCommand`,
  `useSkills`; see "Delivery, work, codex and skills" in `UI_BUILD.md`.
- **Retired:** the New issue and New group dialogs (`app/NewIssueDialog.tsx`, `NewGroupDialog.tsx`, `dialog-parts.tsx`), their Kit entries and
  `newIssueOpen`, `newGroupOpen`, `openNewIssue`, `openNewGroup` in the shell store. `features/inbox` and the `/inbox` page.
- **Loading.** The issue views, the Add work dialog and the Skills view are lazy chunks (`web/src/app/lazy-views.tsx`) fetched when the browser is
  idle; the main chunk is 347 kB and the build has no chunk-size warning. Keep it that way.
- **Kit** (`/kit`, 142 elements, no console errors): registers the issue-delivery, Add work, Codex and Skills entries; new groups Issue · Criteria,
  Issue · Git, Issue · CI; the empty "Workflow · Inbox" group is gone.

## Decisions

The first six were made by the user on 2026-10-22 and still hold. D1 to D8 are the plan's defaults ("any of them can be changed"); all eight are built as written
unless a note says otherwise.

1. **Markdown-first.** `web/mock/workspace/**` is the only source of mock content; the sample world is the fixture `web/mock/sample/`. The parser
   in `web/mock/md/` follows contract §1.3–1.7; every UI write and scripted event is a minimal text edit. Saving a file under `web/mock/workspace/`
   updates the board through HMR in the dev server. The one exception is git, PR and CI data (D2).
2. **Naming.** Workspace → Workflow and Workdatabase (see above).
3. **Context from the Workdatabase.** Library items, glossary terms, files and decisions are linked under `## Links`. Add work's context step offers the
   matching library items and terms as toggle chips; the Goal tab's "Add context" adds more later; the `wf context` bundle puts linked items first.
4. **Library is a markdown-grounded HTML viewer** (Rendered | Source, file:line on hover, inline Edit).
5. **Archify** is not installed in the cloud: diagrams ship "unavailable" with their JSON, and a Prototype button shows a stand-in preview.
6. **The board starts empty.** The shipped workspace has the groups, library and glossary and no issues; **Load sample data** (DevPanel or
   `window.__wf.loadSample()`) puts the 26 sample issues on the board; **Reset data** goes back. The Kit holds the sample while it is open.

- **D1 Issue tabs:** Now · Goal · Criteria · Plan · Log · Git · CI · Files, keys 1 to 8. Plan stays. Criteria left Goal.
- **D2 Git, PR and CI data** are derived and never written into the workspace. Product: `git log` for the trailer `Issue: wf-xxxxx` or a branch
  `wf-xxxxx/…`, and `gh` for pull requests and checks. Prototype: a fixture plus what a Codex run adds.
- **D3 Open in Codex from a browser** copies `codex "Work on …"` and says where to paste it; with the local daemon it would start Codex itself
  (not built: there is no daemon in the prototype). The installed skills do the rest, so the command never goes stale.
- **D4 Do next step** is real in the product (the daemon runs `codex exec` with `doing-next-step`) and simulated in the prototype, with real markdown edits.
- **D5 No inbox.** Needs-you requests stay on cards and in the Now tab; the **Needs you** board filter replaces the list.
- **D6 Add work** replaces + New issue. Number keys pick, Enter continues, Back is always there. The prototype's split is deterministic and written with
  `writing-readable-bulk-text`; the product runs `codex exec` with `adding-work`. **Deviation from the plan's wording:** the Review screen of the group path is gone
  (user request in this pass); Backlog or Planned and the final "Add N issues to <group>" are on the split screen.
- **D7 Skills.** Plugin `plugins/workflow/` with skills that edit the markdown directly (there is no `wf` CLI yet); `scripts/install-skills.sh --codex`; a Skills view.
- **D8 Sample issues** keep the rewrite from commit `cb18cfd`; no further skill work on the sample.

Smaller calls made while integrating, in case the user wants them the other way:

- **One toast per run, from every origin.** The header used to say nothing at the end of a run (its strip shows it for 6 s); now it also gives the one toast
  with "Open log", like the card menu and the palette. If that reads as noise, restore the "unless the header is open" rule in `features/codex/follow-run.ts`.
- **Q005 returns 1.5 s after a run ends** (`useRunActive`, the time the issue takes to be read again), so the signal does not flash at the very end.
- The palette's "Add work…" opens the group path; `n` and the toolbar button start at "What are you adding?".

## Open items for the user

- **Contract approval.** `docs/plan/contract.md` is unchanged. The plan lists what needs approving: D1, D2, D4, D5, the Add work flow and the Skills view. The contract
  also does not name the Workflow and Workdatabase views (only `web/UI_BUILD.md` does).
- `docs/plan/proposals/contract-1.12-tokens.md`: the token changes the UI ships (contrast fixes, hues 6 and 8, scrim, z layers, text tokens), unapproved.
- **Not done in this pass:** plan Phase 5 (a fresh agent given only the `SKILL.md` files drives adding work, the next step and a handoff on a copy of the sample, and
  `wf-lint` must show no new findings) and Phase 6 (commit per workstream, push, republish the static build, send screenshots). The screenshots and the artifact are the old ones.
- **The prototype's seams to the product:** the daemon that starts Codex from the browser and runs `codex exec` (D3, D4); the `gh`-based derivation (D2); the `wf` CLI that the
  skills stand in for. `useNewIssue` and `useNewGroup` are still ops in the data layer but no screen calls them.
- Three sample issues still mention an "inbox" in their own text (`command-palette/plan.md`, `tab-title-count/goal.md`, `build-v1/plan.md`): it is past work in the
  sample, left as written.
- The plan sections §1–§17 are written by another session into `docs/plan/parts/` and `docs/plan/diagrams/`. Do not create or edit those here.

## How the user gives feedback

Every component root carries `data-wf="<ComponentName>"`; the Kit (`/kit`) shows each element with its
variants and a "Copy feedback ref" button. Feedback arrives as "ElementName: change". Apply it to that
component, keep the Kit in sync, re-screenshot, and republish.

## How to run and verify

- `pnpm --dir web install`, `pnpm --dir web dev` (port 5177). The checks, in this order, all clean at the end of this pass:
  `pnpm -s typecheck && pnpm -s exec biome check src mock && pnpm exec vitest run` (737 tests in 36 files) `&& pnpm -s build` (no chunk warning).
- Screenshots: `node web/scripts/shot.mjs <route> <png> [--w 1440|1680|390] [--theme dark] [--sample] [--click "<sel>"]` (one page, clicks) and
  `node web/scripts/sweep.mjs --out <dir> --sample --sheets` (every route × width × theme, with contact sheets; the routes now include `/w?needs=me`,
  `/skills`, `/skills?skill=adding-work` and `tab=criteria`, `git`, `ci` of `wf-3k9x2`; `/inbox` is gone). Both fall back to the system Chromium at
  `/opt/pw-browsers/chromium` in cloud containers.
- The Playwright smoke that closed this pass: empty board → **+ Add work** group path (8 clicks, 1 typed line) → 4 issues on the board; **Load sample data** →
  `wf-3k9x2` → **Do next step** → the strip shows the phases, the tabs do not move, one toast "Codex finished T-4", and the task, the log, Git and CI show it; `/kit` renders
  all 142 sections without console errors. It passes on the dev server and on the static build.
- Publish: `pnpm --dir web build:static`, strip doctype/html/head/body from `dist-static/index.html`
  for the artifact page, pass every other file of `dist-static/` as supporting files, and escape literal
  U+FFFD characters in JS (the publisher rejects them) as `�`. The static build loads its lazy chunks from `./assets/`.

## Workflow scripts used

`docs/plan/workflows/wf-ui-build.js` and `wf-ui-review.js` hold the original builder and reviewer
prompts. In the cloud the container has 4 CPUs, so each workflow runs 2 agents at a time; each agent owns disjoint files. The Codex workflow was built in
phases: data layer and headless skills first, then the four UI workstreams in two parallel workflows, then this integration pass (one agent editing everything).
