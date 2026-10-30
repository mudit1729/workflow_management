# Plan: wf as a workflow manager for Codex

Written 2026-10-30. Opus plans and integrates; Sonnet 5.5 agents build. Every step ends with typecheck,
lint, tests, build and screenshots before it is committed, pushed and published.

## What the user asked for

The three goals:

1. Distribute skills and plugins across the team.
2. Hand anyone the full context of an issue.
3. Keep issues and tasks traceable.

The asks:

- Issue sections: current state, goal, success criteria, log (changes, decisions, learnings), git commits
  and PRs, CI/CD pipelines, files.
- No inbox.
- An **Open in Codex** button, and next to it a **Do next step** button that works in the background.
- **+ Add work** replaces "+ New issue". It is a Typeform-style flow: buttons are preferred over multiple
  choice, multiple choice over dropdowns, and dropdowns over typing. Start with a group, Codex splits it
  into issues, and the issues are added.
- A set of skills that runs the whole flow in Codex or Claude without the UI. The UI and the skills share
  the same markdown, so either side can continue the other's work.

## Decisions (defaults; any of them can be changed)

| # | Decision | Default |
|---|---|---|
| D1 | Issue tabs | **Now · Goal · Criteria · Plan · Log · Git · CI · Files**. Plan stays. Criteria moves out of Goal into its own tab. Keys 1–8. |
| D2 | Where git, PR and CI data come from | Derived, not written by hand. Commits that mention the issue id (a trailer `Issue: wf-xxxxx` or a branch named `wf-xxxxx/...`). PRs and checks come from GitHub via `gh`. The prototype reads a fixture. |
| D3 | Open in Codex from a browser | Copies `codex "Work on wf-xxxxx (issues/…/slug). Read current_state.md first; use the wf skills."` and says so. With the local daemon it starts Codex itself. The installed skills do the rest, so the command never goes stale. |
| D4 | Do next step | Real: the daemon runs `codex exec` with the `doing-next-step` skill on the next ready task. Prototype: a simulated run whose steps are real markdown edits (claim task, log a change, tick it) plus a fake commit and CI run. The card and the issue show it running. |
| D5 | Inbox removed | Needs-you requests stay on cards and in the issue's Now tab. A **Needs you** filter on the board toolbar replaces the inbox list. `/inbox` redirects to the board with that filter. |
| D6 | Add work | One question per screen, number keys pick options, Enter continues, Back is always there. Group path: what → where → outcome (the only typed answer) → size → priority → context → **Codex splits** → keep/drop each proposed issue → add. Issue path is the same minus the split. The prototype's split is deterministic and written with the readable-text skill. Real: `codex exec` with `adding-work`. |
| D7 | Skills | Plugin `plugins/workflow/` (Claude marketplace) with skills that edit the markdown directly, since no `wf` CLI exists yet. `scripts/install-skills.sh --codex` copies them to `.agents/skills/` for Codex. Workdatabase gets a **Skills** view listing them with their install commands (goal 1). |
| D8 | Sample issues | The rewrite with the readable-text skill is kept as committed (`cb18cfd`). No further skill work on the sample. |

## Architecture (unchanged principle: markdown is the source)

- UI writes and skill writes are both minimal markdown edits in the contract format, §1.3–1.7.
- In the dev server, a file saved by Codex under `web/mock/workspace/` reaches the board through HMR. A headless run therefore shows up live in the UI, and a UI edit is just a file for Codex.
- Git, PR and CI data are derived. They are never stored in the workspace.

## Workstreams and file ownership

Agents own disjoint files. Shared files have one owner. Kit registration happens in integration.

| Id | Workstream | Owns |
|---|---|---|
| P | Data layer, built first | `mock/delivery.ts`, `mock/fixtures/delivery-sample.json`, `mock/work.ts`, `mock/codex.ts`, `mock/ops.ts`, `mock/server.ts`, `mock/store.ts`, `src/lib/api/{delivery,work,codex}.ts`, `src/lib/api/types.ts`, `src/lib/api/client.ts`, `src/app/shell-store.ts`, tests for all of these |
| A | Issue sections (D1, D2) | `src/features/issue/**` except `IssueHeader.tsx`, `src/lib/nav.ts` |
| B | Nav without inbox (D5), Skills view (D7 UI) | `src/app/{router,NavRail,useNavRail,shortcuts,ShortcutsDialog,CommandPalette,tab-title,AppShell}.tsx/ts`, `src/features/inbox/**` (deleted), `src/features/skills/**` |
| C | + Add work (D6), Needs-you filter | `src/features/add-work/**`, `src/features/board/{BoardToolbar,BoardPage,filter}.tsx/ts`, `src/app/{NewIssueDialog,NewGroupDialog}.tsx` (retired) |
| D | Codex buttons (D3, D4) | `src/features/codex/**`, `src/features/issue/IssueHeader.tsx`, `src/features/board/{IssueCard,IssueCardMenu}.tsx` |
| E | Headless skills (D7) | `plugins/**`, `.claude-plugin/marketplace.json`, `scripts/install-skills.sh`, `web/scripts/wf-lint.*`, `web/package.json` scripts |

### Interfaces P provides (the others build against these names)

- `useDelivery(issueId)` returns `{ commits, prs, pipelines }`.
- `useSplitWork()` takes `{ title, outcome, size?, context[] }` and returns `{ issues: Proposal[] }`.
- `useCreateWork()` takes a group (new or existing) plus issues, and creates them in one commit.
- `useCodexRuns(issueId?)`, `useStartCodexRun()` with `start(issueId, "next_step")`, and the pure function `codexCommand(issue)` returning `{ command, prompt }`.
- `openAddWork({ kind?: "group" | "issue", group? })` in the shell store. `openNewIssue` and `openNewGroup` forward to it until C retires them.

## Phases

1. **P (data)** and **E (skills)** run in parallel.
2. **A + B** and **C + D** run in two parallel workflows against P's real hooks.
3. **Integrate**: register the Kit entries, wire up, and get typecheck, lint, tests and build clean.
4. **Review** with three lenses, each checked against the three goals: interaction (the buttons > multiple choice > dropdown > text order), visual calm, and headless parity. Then fix, then verify with a sweep and Playwright flows.
5. **Skill evals**: a Sonnet agent given only the `SKILL.md` files drives adding work, the next step and a handoff on a copy of the sample. `wf-lint` must show no new findings, and the UI must load the result.
6. Commit per workstream, push, publish, and send screenshots.

## Acceptance

- Adding a group in the UI ends with N issues on the board in at most 8 clicks and one typed line.
- Do next step changes the task, the log, Git and CI in the issue, and each change is visible as a markdown diff.
- Running `adding-work` and `doing-next-step` in Codex or Claude without the UI leaves files that the UI shows unchanged.
- The installed skills and plugins are visible in Workdatabase › Skills, with the commands to install them.
- No inbox route, nav item or shortcut remains. Needs-you is reachable in one click from the board.

## Contract changes to approve

`docs/plan/contract.md` is not edited until approved. The items are D1, D2, D4, D5, the Add work flow,
and the Skills view.

## Round 2 (2026-10-30): connect an agent, no swimlanes

### Asks

- "In the dashboard have the ability to connect the agent, like Codex or Claude."
- "Remove swimlanes."

### Decisions (defaults; any of them can be changed)

| # | Decision | Default |
|---|---|---|
| D9 | What connecting means | A small **bridge** runs on the person's computer at the repo root: `node plugins/workflow/scripts/wf-bridge.mjs --agent codex --pair 4F7K-92`. The dashboard pairs with it once by that code, then talks to it on `127.0.0.1:7457`. The bridge runs the agent headless in the repo (`codex exec --full-auto …` or `claude -p … --permission-mode acceptEdits`; both overridable). The agent edits the markdown, and the board shows the edits as usual. One agent at a time. |
| D10 | Connect flow | Same Typeform parts as Add work: **Which agent?** [Codex] [Claude Code] → **Run this in the repo** (one copy button; the screen waits and turns into "Connected" with host, repo, agent version and a skills check that offers the install command if skills are missing) → Done. About 4 clicks. |
| D11 | Where it shows | A footer row in the nav (`Codex · connected` or `Connect an agent`) opens the Agent panel: status, host, repo, version, skills, recent runs, Switch agent, Disconnect. The palette has Connect, Switch and Disconnect. |
| D12 | What changes when connected | **Do next step** needs an agent. Without one it opens the connect flow, then starts the run. **Open in Codex** follows the agent: "Open in Claude Code" copies `claude "…"`. Run labels, the card marker and `claimed_by` use the agent's name. Add work's split is unchanged this round. |
| D13 | Safety | The bridge only answers after pairing (one-time code, then a token), only to the dashboard's origin, and builds the agent's prompt itself from a validated issue id. The browser never sends a prompt or a shell command. |
| D14 | Prototype | The static artifact cannot reach `127.0.0.1`, so pairing is simulated there ("Prototype: the bridge answers by itself"). The dev server pairs with a real bridge; it is tested end to end with a fake agent binary. `window.__wf.connectAgent("codex")` connects from scripts. |
| D15 | Swimlanes | Removed. The board is one set of columns; the group tree filters it, and each card already names its group. `?swim=` is dropped from URLs, the toolbar control and `Swimlane` go, and drag works across the whole board. |

### Workstreams and ownership

| Id | Workstream | Owns |
|---|---|---|
| S | Remove swimlanes | `src/features/board/**`, `src/lib/nav.ts`, `src/app/search.ts` (+test), `src/app/App.tsx` (swim lines only), `src/lib/prefs.ts`, `src/features/kit/entries/board.tsx`, board rows of `web/scripts/sweep.mjs` |
| X | Agent data and bridge | `plugins/workflow/scripts/wf-bridge.mjs`, `web/scripts/wf-bridge.test.ts`, `web/mock/agent.ts` (+test), agent parts of `web/mock/{server,codex}.ts`, `src/lib/api/{agent,bridge-client}.ts`, agent parts of `src/lib/api/{types,client,keys,index,resume,codex}.ts`, the plugin README's bridge section |
| Y | Agent UI | `src/features/agent/**`, `src/features/codex/**`, `src/app/{NavRail,CommandPalette,AppShell,lazy-views,shell-store}.tsx/ts`, `src/features/kit/entries/{agent,codex}.tsx`, `src/features/kit/registry.ts` |

Order: S and X in parallel, then Y on X's real hooks, then review (interaction, visual, safety and parity), fix, verify, commit, publish.
