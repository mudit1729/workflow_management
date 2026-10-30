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
   Library · Skills view (`/skills`, `g s`) that lists them with their install commands.
2. **Hand anyone the full context of an issue.** Eight issue tabs (Now, Goal, Criteria, Plan, Log, Git, CI, Files), the
   **Open in Codex** button (copies a `codex "Work on wf-xxxxx …"` command and shows the exact prompt), **Copy context** (copies the context bundle as markdown, the text the
   `handing-off` skill prints, and shows it, with a prompt that asks Codex or Claude to do the same hand-off), and the `handing-off` skill. Handing an issue over hands over
   the content, not a command.
3. **Keep issues and tasks traceable.** Task ↔ commit ↔ CI run: the Git and CI tabs derive from commits that carry the trailer
   `Issue: wf-xxxxx` (or a branch `wf-xxxxx/…`); a Codex run writes the task, the change entry, the commit and the CI run, every
   one visible as a markdown diff.

The user's words for the UI, which the build follows: "you click buttons, which are preferred over MCQ which are preferred over
drop down menus which are preferred over writing text"; "a way to open the codex in a button form / additionally have a button beside it
which in the background does the next step"; "the ui should be usually without going to codex, codex should be able to replicate the flow
with a set of skills without coming to the ui and the ui should be able to work with it also".

## What exists now

- **Naming.** Workspace → **Workflow** (Board, with a Needs you filter) and **Library** (Personal · Team libraries · Files · Skills; it was Workdatabase, see "Libraries" below). Shortcuts
  `g w`, `g d` or `g l`, `g p`, `g t`, `g g`, `g f`, `g s`, `g k`; `n` opens Add work. There is **no inbox**: `/inbox` redirects to `/w?needs=me`.
- **Board.** Toolbar with **Needs you** (a toggle with the count of open requests; `?needs=me`) and the primary **+ Add work**. A card shows a
  Codex mark while a run goes on its issue; its menu has Open in Codex and Do next step.
- **+ Add work** (`web/src/features/add-work`). One question per screen. Group path: What → Where → Outcome (the one typed line) → Name → Size →
  Priority → Context → **Codex splits it**. The split screen also keeps or drops each proposal, asks **Backlog or Planned** (keys `1` and `2`) and its
  button adds the issues, so **a group takes 8 clicks, the opening click included, and one typed line** (checked with Playwright; a unit test pins the number).
  A single issue has its own short path with a Review screen.
- **Issue tabs 1 to 8** in the drawer and on the narrow page; three columns on the wide page: `[Now + Goal] | [Plan + Criteria] | [Log · Git · CI]`.
  Criteria moved out of Goal into its own tab; `[[#SC-n]]` links go to it. Keys 1 to 8 work in every layout (on the wide page a section scrolls into view and takes focus).
  **Traceability runs both ways:** the Git tab's `T-n` pill opens the task, a Log entry's commit chip opens the commit in Git, and a task's detail lists its commits and CI runs, each a link.
- **Empty states and hints** (`features/issue/skill-hint.tsx`): a button first (Do next step, Write the context), then one real skill of the workflow plugin linked to its page in
  Library · Skills, and the prompt with a copy button for `codex '…'`. No invented skill names and no `wf …` command shown as runnable (there is no CLI); see "UI hints" in `web/UI_BUILD.md`.
- **Open in Codex / Do next step** (`web/src/features/codex`). The run is simulated in the prototype, but each phase is a real markdown edit
  (claim the task, log a change, verify with a CI run, finish the task and `current_state.md`, add a commit). The same code path serves the
  issue header, the card menu and the palette. **One confirmation per event:** a run shown in the header's strip has no toast; one started from the card menu or the palette gives one toast when it ends;
  Open in Codex confirms in its popover line and has no toast; Copy context confirms in its popover (the palette gives one toast with View). While a run goes the
  Q005 "current_state is behind" signal is held back (the log is ahead of `current_state.md` on purpose), so the tabs do not move.
- **Skills** (`web/src/features/skills`, `plugins/workflow/skills/*`): `using-wf`, `adding-work`, `planning-issues`, `doing-next-step`,
  `logging-work`, `checking-status`, `handing-off`, `writing-readable-bulk-text`, and for libraries `keeping-a-library`, `summarizing-codebase`, `summarizing-work`, `querying-library`. They edit the same markdown, so Codex or Claude can run the
  whole flow without the UI and a UI edit is just a file for the next skill run. `pnpm wf:lint <workspace>` checks a workspace.
- **Data layer** (`web/src/lib/api`, `web/mock`): `useDelivery`, `useSplitWork`, `useCreateWork`, `useCodexRuns`, `useStartCodexRun`, `codexCommand`,
  `useSkills`; see "Delivery, work, codex and skills" in `UI_BUILD.md`.
- **Retired:** the New issue and New group dialogs (`app/NewIssueDialog.tsx`, `NewGroupDialog.tsx`, `dialog-parts.tsx`), their Kit entries and
  `newIssueOpen`, `newGroupOpen`, `openNewIssue`, `openNewGroup` in the shell store. `features/inbox` and the `/inbox` page.
- **Loading.** The issue views, the Add work dialog and the Skills view are lazy chunks (`web/src/app/lazy-views.tsx`) fetched when the browser is
  idle; the main chunk is 347 kB and the build has no chunk-size warning. Keep it that way.
- **Kit** (`/kit`, 142 elements at that pass, 164 with the library entries; no console errors): registers the issue-delivery, Add work, Codex and Skills entries; new groups Issue · Criteria,
  Issue · Git, Issue · CI; the empty "Workflow · Inbox" group is gone.

## Decisions

The first six were made by the user on 2026-10-22 and still hold. D1 to D8 are the plan's defaults ("any of them can be changed"); all eight are built as written
unless a note says otherwise.

1. **Markdown-first.** `web/mock/workspace/**` is the only source of mock content; the sample world is the fixture `web/mock/sample/`. The parser
   in `web/mock/md/` follows contract §1.3–1.7; every UI write and scripted event is a minimal text edit. Saving a file under `web/mock/workspace/`
   updates the board through HMR in the dev server. The one exception is git, PR and CI data (D2).
2. **Naming.** Workspace → Workflow and Workdatabase (see above; the second was renamed Library on 2026-10-30).
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

- **One confirmation per event** (replaces the earlier "one toast per run, from every origin"): while the header's strip shows the end of a run it is the confirmation, so no toast; the card menu and the
  palette have no strip and toast once. The same goes for the copy buttons (a popover line, or one toast where there is no popover).
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

## Review pass on the issue views (2026-10-30)

Fixed in `web/src/features/issue/**` (not `IssueHeader.tsx`), `RefLink`, the Kit, `UI_BUILD.md` and the sweep scripts; each was checked with a screenshot or a Playwright run:

- **Copy context** (goal 2): `HandoffButton` and `HandoffPanel` copy the bundle markdown (`api.context`) and show it; `copyContextWithToast(id)` is the palette's version; both can open the whole text in a dialog
  (`HandoffViewHost`, mounted by the issue view). Verified: the clipboard holds the bundle (7.7 kB, 1.9k tokens on `wf-3k9x2`), the popover says so, no toast.
- **Hints name real skills** (`SkillHint`): Now (`handing-off`), Plan (`planning-issues`, plus a **Do next step** button, which plans first), Goal and Criteria (`using-wf`, plus an editor button), the three logs (`logging-work`),
  missing issue files in the Files tab (each file's skill, linked), the claimed-criterion popover (`doing-next-step`). The fake `wf state|append|check|decide|resolve` lines are gone from these screens.
- **Traceability:** a Log entry's commit chip opens the Git tab on that commit; a task's detail has Commits and CI rows that open the Git or CI tab on that row.
- **Layout:** Plan lanes fit a 440 px column (level columns `minmax(168px, 240px)`, lane names above their tasks under 520 px, the task in progress scrolled into view); the log column's tab strip has the drawer's
  active bar; the Log tab no longer says its count three times; `MetaLine` ends the stranded dots (Now tab, Needs you rows, CI rows); CI rows lose the word "CI" and say "test failed" once; Files rows put the
  description under the name on a phone; evidence chips and all `InlineText` code stay at or above 11 px (`sweep.mjs` now prints a note for any text under 11 px).
- **Keyboard:** keys 1 to 8 work on the full page in the two- and three-column layouts; answering a request moves focus to the next request, or to the Now panel when it was the last.

## Integration pass (2026-10-30): what the four review teams left and how it was closed

- **The handoff bundle follows the `handing-off` table** (`web/mock/context.ts`): Goal, Success criteria, Current state, **Linked context** after Current state, Ready tasks, Last changes, Decisions, Learnings (last 3), **Git/PRs/CI** from the delivery data, **Library**,
  `none.` for every empty section, one reference-data note, an `Updated <age> ago` line, a footer `<!-- wf context <id> · ~N of 6,000 tokens · left out: <sections or none> -->` and the last line `To resume: codex '…'` (the one resume prompt of `format.md` §15, also used by the README, `src/lib/api/resume.ts` and the Open in Codex button).
  The budget cuts from the bottom of the table, never rows 1 to 3. The Copy context button, the palette ("Hand over <id>: copy its context", "View the context of <id>") and the Kit all copy that same markdown.
- **Do next step plans first.** On an issue without a plan the run writes `plan.md` from the criteria (`mock/codex-plan.ts`, the `planning-issues` format), sets `planned`, then claims T-1 in the same run. `doing-next-step`, `planning-issues` and the AGENTS.md snippet say the same; the UI keeps one label, "Do next step" (header, Plan tab, card menu, palette).
  A run claims goal.md too (`status: in_progress`, `claimed_by`, `lease_until`) unless another author holds a live coordinator lease, ticks a criterion only with a command's evidence, and ends a `verify: manual` task in `review` with an approval request in Needs you.
- **Sample clock.** `WF_NOW=2026-10-22T16:27+05:30` on `web/mock/sample` gives the dashboard's answers in `wf-status.sh` (a live lease with 35 minutes left, T-4 ready, nothing stale); `node plugins/workflow/scripts/check-sample-clock.mjs` checks it. Run skill evals on a copy.
- **Accept and Reject on a proposed decision are buttons** now (`set_decision_status` op, `useSetDecisionStatus`; the one in-place edit `logging-work` allows). The card changes its status chip; there is no toast.
- **Hints name only real things.** The eight skills of `plugins/workflow/skills` and buttons; no `wf …` command is shown as runnable (the sample's own next steps were reworded too: "Verify SC-3 with its command."). `hints.test.ts` fails on an invented skill or command in `features/issue` and `features/kit`.
- **One confirmation per event.** A run that ends while the header strip shows it has no toast; a run from the card menu or the palette gives one toast when it ends; Open in Codex in the header has the popover's line only; the palette's Open in Codex toasts once; a cancel has none.
- **Install panel** has two audiences for Claude Code (just me / everyone on the repository) and two steps for Codex (`install-skills.sh --codex`, then `--print-agents-md >> AGENTS.md`), and says `mudit1729/workflow_management` is the team's repository.
- **Still open, small:** the Add work "Start in: Planned" writes `status: planned` without a `plan.md` (adding-work writes `backlog` only; planned is the result of planning-issues); a `verify: manual` criterion makes the first Do next step end in `review`
  (the strip says "Done: T-1, waiting for a check"); the Kit's board entry counts every author's requests in `summarize(visible)`.

## Libraries: personal, team and Ask (2026-10-30, branch `library`)

Spec: `docs/plan/proposals/libraries-spec.md`. Build contract: the library, personal, team and ask sections of `web/UI_BUILD.md`. The nav section **Workdatabase is now Library**: Personal, Team
libraries, Files, Skills. Everything in a library is markdown; the viewer is a calm document wiki with GIFs, video files and click-to-load embed cards.

### Decisions

L1 to L4 were made by the user. L5 to L7 are the spec's defaults, built as written.

- **L1 Where a personal library lives.** A private GitHub repo of the person's own, by default `github.com/<you>/wf-library`; the connected agent's bridge keeps a local clone and pushes edits.
  Prototype: the fixture `web/mock/personal/` plus edits in the browser; the first visit shows two buttons (**Create github.com/<you>/wf-library (private)**, **Use a repo I already have**).
- **L2 How private team repos are read.** Through the agent bridge, with the person's own git credentials. A public repo is read straight from GitHub (one tree call, files pinned to the commit).
  Prototype: `mock/libraries/github.ts` reads real public repos from the browser and the fixture repo `acme/platform-handbook` offline; a private repo shows **Connect an agent to read private repos**.
- **L3 Asking a library from an issue.** The connected agent answers with citations (the `querying-library` skill); **Link cited pages** and **Save to log** write to the issue; with no agent the five best passages are shown.
  Prototype: the answer is extractive and labelled "Prototype answer".
- **L4 The workspace's own Library and Glossary** are the first team library, "this workspace" (alias `wf`); the glossary is one of its pages. `[[lib-xxxxx]]`, Promote, Approve and the draft, retired and overdue banners keep working.
- **L5 Group and issue summaries** are written by the agent on demand and are marked stale when the issue changed after the summary (`rev`). The `rev` is the first 7 hex characters of the SHA-256 of the wf files
  of the folder with every time made neutral, so a lease renewal or a moved clock does not make a summary stale. **The dashboard and `summarizing-work/scripts/wf-rev.sh` compute it the same way**
  (`node plugins/workflow/scripts/check-work-revs.mjs` checks it).
- **L6 Editing.** The personal library is edited in the dashboard (`SourceEditor`, a leave guard, "Saved · pushed a1b2c3d"); team libraries are read-only with Open on GitHub. "Propose a change" comes later.
- **L7 Media.** Pictures and GIFs are files in the repo, video is a file (`.mp4`, `.webm`) or a YouTube, Vimeo or Loom link on a line of its own. A GIF stills under reduced motion, a video never autoplays, an embed loads only
  on click, a file over 25 MB is linked. See "Media rules" in `UI_BUILD.md`.
- **Smaller calls made while building.** `_group.md` is a section's own page, so group summaries are section pages (the spec names only `index.md` and `README.md`). A group summary has Outcome, Groups, Issues, Risks, Next;
  an issue summary has five fixed sections. `rev` and `commit` are quoted in the frontmatter (an unquoted `0123456` is a number). Blocked sorts after in progress and cancelled last. Aliases are `[a-z0-9][a-z0-9_-]*`;
  `me`, `t` and the workspace alias are reserved. A team library's default alias is its repo name (`platform-handbook`). Libraries added in a session are lost on reload.

### What exists

- **Routes.** `/lib`, `/lib/me`, `/lib/me/$`, `/lib/t/$alias`, `/lib/t/$alias/$`; `/lib/t` redirects to the workspace library; `/lib/<lib-id>`, `/glossary` (`?q=<term>` opens at the heading) and `/lib?tab=glossary` redirect to the page.
- **Palette.** Open personal library, Add team library…, Search the library, and (with an issue open) Ask the library about <id>. Shortcuts `g p`, `g t`; `[` and `]` between pages; `/` searches.
- **Kit.** Groups Library, Library · Personal, Library · Team, Library · Ask: the wiki viewer's header, tree, rail, outline, callouts and media, the personal home sections, each Add team library screen, and the Ask panel's states.
- **Skills.** Four more: `keeping-a-library`, `summarizing-codebase`, `summarizing-work`, `querying-library` (12 in all). They write the same files the dashboard writes.
- **Tooling.** `scripts/sweep.mjs` has the library routes; a route under `/lib/t/platform-handbook` first adds the example library through the palette and the dialog (`scripts/goto.mjs`). `window.__wf.resetPersonal()` and `setUpPersonal()`,
  `window.__wf.teams.moveRemote()` and `resetRemote()` (a newer commit on the fixture repo, so the footer offers Update), `window.__wf.setPrototypeAnswers(false)` (Ask as it is with no agent).

### Seams for the other team (agent connection)

Each is a registration function; until it is called the prototype simulates and says so ("Prototype").

- `setAskAgent({ handle, ask(request, signal, onText) })` in `features/ask/agent.ts`: runs `querying-library` on exactly `request.pages`; the request carries the prompt text.
- `setPersonalAgent({ summarize(request) })` in `features/library/personal/summarize.ts`: runs `summarizing-codebase` or `summarizing-work`; the dashboard shows "Summarizing…" while it runs and re-reads the pages.
- `setConnectAgentHandler(fn)` in `features/library/team/connect-hook.ts`: the **Connect an agent to read private repos** button, and **Connect an agent for an answer** in the Ask panel.
- The bridge endpoints of spec section 8 (`GET /libraries`, `POST /libraries`, `.../sync`, `.../tree`, `.../file`, `PUT /libraries/me/file`, `POST /ask`) are not implemented. The paths in `src/lib/api/client.ts` for the library calls are a guess.
  `docs/plan/contract.md` does not yet name `add_learning`, `add_links` with `kind: "page"` or the library endpoints.

### Open items

- **Questions for the user.** (1) The codebase summary file is named `mudit1729-workflow_management.md`, as asked, but its `repo:` is the real remote `workflow_maagement`, so Open on GitHub works; rename the file to match, or change the URL?
  (2) The `rev` rule above is the dashboard's and now also the script's; the earlier script hashed raw bytes, so a lease renewal made every active issue stale. Keep this? (3) The personal fixture's dates are fixed (the sample's are moved to the clock at every load), so
  "summarized 10 hours ago" will age; shift them in the loader too?
- **Not built.** Code highlighting in library pages (plain mono blocks) and diagram fences in them ("Diagram not found"); an oEmbed title or poster for embed cards; the palette does not search pages of the personal or team libraries (only the old items);
  a startup read of `libraries.toml` (an entry listed there shows "Not loaded" with a one-click read); the footer shows the commit but "Updated by" of a team page comes only from its frontmatter; a blob link to a page outside the chosen root opens the home;
  the Add team library dialog never offers the whole repo as a root when several folders hold markdown; the Pick pages tree in Ask is checkboxes, not an ARIA tree.
- **Limits of the public reader.** GitHub allows 60 unauthenticated calls an hour per IP and a lookup costs 3 (a repeat is free through the ETag). At most 500 pages, none over 1 MB; the rest are listed under Other files. `mock/libraries/github.ts` lives in `mock/` for the prototype and belongs in the product code.
- **Lint.** `mock/md/refs.ts` does not read `[[alias:path]]` under `## Links`, so such a bullet is not validated (no F009 for a page that was deleted); the Links row shows it dashed.
- **Merge into the other checkout.** The branch touches the shell the other team is changing: `AppShell.tsx`, `NavRail.tsx`, `router.tsx`, `shell-store.ts`, `CommandPalette.tsx`, `shortcuts.tsx`, `lib/nav.ts`, `lib/api/*`, `mock/server.ts`, `gen/types.ts`, `IssueHeader.tsx`
  (one button), `vite.config.ts` (chunk groups), `web/UI_BUILD.md` and this file. Re-run the checks below after the merge; the mock server chunk was 310 kB, and the markdown of the mock is its own chunk (`mock-files`).

## How the user gives feedback

Every component root carries `data-wf="<ComponentName>"`; the Kit (`/kit`) shows each element with its
variants and a "Copy feedback ref" button. Feedback arrives as "ElementName: change". Apply it to that
component, keep the Kit in sync, re-screenshot, and republish.

## How to run and verify

- `pnpm --dir web install`, `pnpm --dir web dev` (port 5177). The checks, in this order, all clean at the end of this pass:
  `pnpm -s typecheck && pnpm -s exec biome check src mock scripts && pnpm exec vitest run` (1239 tests in 55 files) `&& pnpm -s build` (no chunk warning; the mock server chunk is 310 kB); also `pnpm -s wf:lint mock/workspace` (only the known F009 warnings), `node plugins/workflow/scripts/check-skills.mjs` (12 skills ok) and `node plugins/workflow/scripts/check-work-revs.mjs`. With a dev server up: `SHOT_BASE=http://localhost:5177 node web/scripts/smoke-library.mjs` (the library smoke, zero console errors).
- Screenshots: `node web/scripts/shot.mjs <route> <png> [--w 1440|1680|390] [--theme dark] [--sample] [--click "<sel>"]` (one page, clicks) and
  `node web/scripts/sweep.mjs --out <dir> --sample --sheets` (every route × width × theme, with contact sheets; the routes now include `/w?needs=me`,
  `/skills`, `/skills?skill=adding-work` and `tab=criteria`, `git`, `ci` of `wf-3k9x2`, and the library routes; `/inbox` is gone). A route under `/lib/t/platform-handbook` adds the example library first (`scripts/goto.mjs`). Both fall back to the system Chromium at
  `/opt/pw-browsers/chromium` in cloud containers.
- The Playwright smoke that closed this pass: empty board → **+ Add work** group path (8 clicks, 1 typed line) → 4 issues on the board; **Load sample data** →
  `wf-3k9x2` → keys 1 to 8 → **Do next step** → the strip shows the phases ("Claiming T-4" … "Done: T-4"), no toast beside it, and the task (Plan 2/5), the log (19), Git (7) and a new CI run show it; a second run started from a card menu is cancelled with no toast, and one that ends gives one toast; `/kit` renders
  all 142 sections without console errors. It passes on the dev server and on the static build.
- Publish: `pnpm --dir web build:static`, strip doctype/html/head/body from `dist-static/index.html`
  for the artifact page, pass every other file of `dist-static/` as supporting files, and escape literal
  U+FFFD characters in JS (the publisher rejects them) as `�`. The static build loads its lazy chunks from `./assets/`.

## Workflow scripts used

`docs/plan/workflows/wf-ui-build.js` and `wf-ui-review.js` hold the original builder and reviewer
prompts. In the cloud the container has 4 CPUs, so each workflow runs 2 agents at a time; each agent owns disjoint files. The Codex workflow was built in
phases: data layer and headless skills first, then the four UI workstreams in two parallel workflows, then this integration pass (one agent editing everything).
