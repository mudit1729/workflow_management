# Settings: the skills flow

Status: proposal, 2026-10-30. Builds on `libraries-spec.md` (personal and team libraries) and `codex-workflow-plan.md` round 2 (the connected agent).

The user's ask: "a settings pane where the entire flow of skills is mentioned and is clickable to change it, like goal skill, plan skill, etc."

## Decisions

| Id | Topic | Decision |
|---|---|---|
| F1 | Clicking a step | Swap the skill that runs it, set the step's options, and edit the skill (a copy when it is a built-in or a read-only team skill). |
| F2 | Who a change applies to | The team default lives in the workspace's `workflow.toml` (shared through git). Anyone can override a step for themselves in their personal library's `library.toml`. The page always shows which value is in effect and where it comes from. |
| F3 | Extras | Custom steps: insert any skill after Add work, Plan, Do next step or Hand off. No new built-in steps, no on/off rules this round. |
| F4 | Where | A Settings page (`/settings`) opened by a gear in the nav footer, with tabs **Skills flow**, **Agent** and **Workspace**. |
| F5 | Real, not a label | The skills, `wf-env.sh`, the dashboard's hints and prompts, the context bundle, the Do next step run and the agent bridge all resolve "the skill for step X" through one rule (section 4). Swapping a step changes what agents run. |
| F6 | Writes | Each click saves at once, as a minimal edit that keeps every other key and comment. One confirmation: a "Saved to workflow.toml · Undo" line in the panel, no toast. |

## 1. The flow

| Step id | Name | Built-in skill | What a replacement must do (shown in the panel as "Contract") |
|---|---|---|---|
| `add` | Add work | `adding-work` | Write `goal.md` for each new issue (status `backlog`), `_group.md` for a new group, and report the new ids. |
| `plan` | Plan | `planning-issues` | Write `plan.md` with phases and tasks in the format of `format.md`, set the issue to `planned`, log a `kind: docs` change. |
| `do` | Do next step | `doing-next-step` | Claim one ready task with a lease, do it, verify it, log it, refresh `current_state.md`, release the lease. Plans first when there is no plan (with the Plan step's skill). |
| `log` | Log | `logging-work` | Append `C-`/`D-`/`L-` entries with `{#id}` anchors in the format of `format.md`. Runs inside Plan and Do next step. |
| `handoff` | Hand off | `handing-off` | Refresh `current_state.md` and print the context bundle ending with the resume line. |
| `status` | Status (anywhere) | `checking-status` | Keep the output of `wf-status.sh` (other skills call it by path). |
| `style` | Writing style (anywhere) | `writing-readable-bulk-text` | Shape titles and one-line entries for lists. |

Order on screen: **Add work → Plan → Do next step → Hand off**, with **Log** drawn as part of Do next step ("runs inside Plan and Do next step"), and an **Anywhere** row with Status and Writing style.

A built-in skill is offered only for its own step. The library skills (`summarizing-work`, `summarizing-codebase`, `keeping-a-library`, `querying-library`) are offered as custom steps only.

## 2. Skill references and sources

A step names a skill by reference:

| Reference | Source | Where the folder is |
|---|---|---|
| `planning-issues` (bare) | Built-in | `plugins/workflow/skills/<name>/` |
| `ws:<name>` | This workspace (team) | `<workspace root>/skills/<name>/SKILL.md` |
| `<alias>:<name>` | A team library | `skills/<name>/SKILL.md` under that library's root (`libraries.toml` `[[team]]` alias) |
| `me:<name>` | My library | `skills/<name>/SKILL.md` in the personal library |

A skill folder is the same as a built-in one: `SKILL.md` with `name` and `description` only (the `check-skills.mjs` rules), optional `scripts/` and `references/`. A copy keeps its `../using-wf/...` paths, which work once it is installed beside the built-ins.

The Skills catalog (Library → Skills) lists all four sources, grouped, each skill keyed by its reference, so two skills with the same name never collide. The install panel adds the command for team and personal skills (section 7).

## 3. File formats

### 3.1 Team default: `workflow.toml`

```toml
# The skills flow (Settings → Skills flow). A step that is left out uses its built-in skill.
[flow.plan]
skill = "ws:acme-planning"
max_tasks = 8

[flow.do]
finish = "review"

# Custom steps run after the step named in `after`, in `order`.
[flow.custom.security-check]
after = "do"
skill = "platform:checking-security"
label = "Security check"
required = true
order = 1
```

- Scalars only (strings, integers, booleans), one table per step and per custom step, so `wf-env.sh config flow.plan.skill` already reads them. No arrays, no inline tables, no trailing comments on table headers.
- Allowed step tables: `flow.add`, `flow.plan`, `flow.do`, `flow.log`, `flow.handoff`, `flow.status`, `flow.style`. Allowed keys: `skill` plus the step's options (3.3).
- A custom step id is kebab-case. `after` is one of `add`, `plan`, `do`, `handoff`. `required` defaults to `false`, `order` to 1, `label` to the skill's name in words.
- `flow` joins the known top-level keys of `workflow.toml` (`TOML_KEYS`), and `format.md` section 3 documents it.

### 3.2 Personal override: `library.toml` in my library

```toml
name = "Personal library"
owner = "shruti"
kind = "personal"

[flow.plan]
skill = "me:planning-small"

[flow.custom.notify-me]
after = "handoff"
skill = "me:notifying-me"
```

- Same tables and keys as 3.1. A personal value wins over the team value, key by key; a personal custom step runs after the team's custom steps at the same point.
- A person cannot remove or change a team custom step (a team step is policy). The panel says so.
- The override follows the person: it applies to every workspace they work in, and to every run their agent does. A teammate's run uses the teammate's override.

### 3.3 Step options

Options are buttons. Each one changes real behavior in the skill text, which reads it through `wf-env.sh flow <step> <option>`. Defaults equal today's behavior; the build aligns each default with the current skill text and says so where it differs.

| Step | Option | Values (default first) | Effect |
|---|---|---|---|
| Add work | `then` | `offer` · `plan` · `stop` | After writing the issues: offer Plan for the first one (today), plan every new issue at once, or stop. |
| Plan | `max_tasks` | `8` · `5` · `12` | The most tasks a plan may have before it must be split into phases or issues. |
| Do next step | `finish` | `verify` · `review` | A task whose verify passes goes to `done` (today; `manual` verify goes to `review`), or every task goes to `review` for a person. |
| Do next step | `commit` | `task` · `none` | Commit after each task with the `Issue:` trailer (today), or leave the changes for a person to commit. |
| Hand off | `budget_tokens` | `6000` · `4000` · `10000` | Stored in `[context] budget_tokens` (exists today). Team only. |
| Hand off | `changes` | `5` · `3` · `10` | Stored in `[context] changes`. Team only. |
| Status | `issue_hours` | `24` · `12` · `48` | Stored in `[staleness] issue_hours`. Team only. |
| Status | `task_hours` | `4` · `2` · `8` | Stored in `[staleness] task_hours`. Team only. |

Log and Writing style have no options ("This step has no options.").

## 4. One resolution rule

For a step `s` and a key `k` (`skill` or an option): the personal `library.toml` `[flow.s] k`, else `workflow.toml` `[flow.s] k`, else the built-in default (for the four team-only options: their existing table, else its default). Custom steps after a step: the team's (by `order`, then id), then the person's.

A reference that does not resolve (the team library was removed, the folder is gone) falls back to the built-in skill and is reported: a warning on the step card, a `wf:lint` finding, and a line in `wf-env.sh flow`.

The rule is implemented twice and pinned by one shared fixture test: in `wf-env.sh` (agents) and in a TypeScript resolver (the dashboard). The test runs both over the same files and compares the output.

### 4.1 `wf-env.sh flow`

| Command | Prints |
|---|---|
| `wf-env.sh flow` | The whole flow, one line per step: `<step> <skill ref> <source> <origin: built-in\|team\|me> [options]`, then custom steps `after:<step> <id> <skill ref> <required> <origin>`. Unresolved references are flagged. |
| `wf-env.sh flow <step>` | The skill reference in effect. |
| `wf-env.sh flow <step> <option>` | The option value in effect (default when unset). |
| `wf-env.sh flow custom <step>` | The custom steps after that step, one per line: `<id>\|<skill ref>\|<required>\|<label>`. |
| `wf-env.sh flow path <ref>` | The `SKILL.md` path of a reference: a built-in sibling folder, `<root>/skills/<name>`, the personal library (`wf-lib.sh root` rules: `$WF_LIBRARY`, else the one clone under `~/.wf/libraries` with `kind = "personal"`), or a team clone. |

No personal library found is not an error: the team flow applies.

### 4.2 The skills honor the flow

- `using-wf` gets a section "The skills flow": run `scripts/wf-env.sh flow` once per task; when a step names another skill, read that skill's `SKILL.md` (`flow path`) and follow it instead of the built-in one; run each custom step at its point; a `required` custom step that fails stops the run with a `kind: failure` change and a needs-you request; an optional one that fails is logged and the run goes on.
- Every hand-off in the built-in skills names the step, not only the skill: "Run the Plan step's skill (`wf-env.sh flow plan`; built-in `planning-issues`)". Sites: `adding-work` (titles, the offer to plan), `planning-issues` (log, style), `doing-next-step` (plan first, log, answer entries), `logging-work` (style), `handing-off` (log, status, the resume line), `checking-status` (routing to Do next step).
- Custom step points:
  - after `add`: after the issues are written and checked, before the report;
  - after `plan`: after the plan is written, logged and checked;
  - after `do`: after the task's commit and before its log entry, so the custom step's result goes into the entry's `evidence`;
  - after `handoff`: after the bundle is delivered.
- `install-skills.sh` gains `--from DIR` (repeatable), which installs every `DIR/*/SKILL.md` folder beside the built-ins and refuses a name that is already a built-in. `check-skills.mjs` gains `--with-builtins` to check a team or personal skills folder against the built-ins (it needs `using-wf` beside them).

### 4.3 The dashboard honors the flow

- A `useFlow()` hook gives the resolved flow with the origin of each value. Every place that names a skill today asks the flow instead: `SkillHint`, `SkillLink`, the `ASK.*` prompts, `ISSUE_FILE_SKILL` and the docs list, the empty states, the personal library's hints, the board's Add work hint, the derived "Fix:" hints, the handoff prompt.
- The resume prompt names the Do next step skill in effect. With the built-in skill the prompt is word for word today's (tests stay pinned).
- The context bundle gets a "Skills flow" line when anything differs from the built-in flow: "Plan: ws:acme-planning (team) · After Do next step: Security check (platform:checking-security, must pass)". A fresh agent learns the flow from the bundle.
- The prototype's Do next step run shows a phase per custom step after Do (between verify and done), and each phase carries the skill that ran it (`phases[].skill`), shown in the run strip's tooltip and the run's details.
- The agent bridge (round 2) reads `workflow.toml` and the person's override itself and names the skill in the prompt it builds; the browser still never sends a skill or a prompt. The bridge's skills check covers every skill the flow names. (Wired at the merge with round 2.)

## 5. The Settings page

### 5.1 Shell

- Nav footer: a gear button after the notifications button in row 1 (and in the collapsed rail before "?"), tooltip "Settings". Palette: "Open settings", "Skills flow", "Change the Plan skill" (and one per step). Shortcut `mod+,`.
- Routes: `/settings` redirects to `/settings/flow`; `/settings/flow?step=<id>` opens a step's panel (`?step=custom:<id>` for a custom step, `?step=new&after=<step>` for the add form); `/settings/flow/edit?skill=<ref>` is the editor; `/settings/agent`; `/settings/workspace`. Tab title "Settings · Skills flow".
- Top bar: tabs Skills flow | Agent | Workspace, in the same style as the Library tabs.

### 5.2 Skills flow tab

- Header: "Skills flow", subline "Which skill runs each step of the work, for everyone in <workspace>. Change a step for the whole team or just for you." Right: a two-button switch **In effect for me | Team default**. Team default shows the workspace's values only.
- The flow: four step cards in a row joined by arrows (Add work → Plan → Do next step → Hand off). Log hangs under Do next step as a smaller card. Between two steps, and after Hand off, a "+" button (always visible, quiet) inserts a custom step; custom steps are smaller cards with a dashed border between the steps they sit between. Below, a row "Anywhere" with Status and Writing style.
- A step card: the step name; the skill reference in mono; a source chip (Built-in, This workspace, the team library's name, Yours); a dot and "Your override" when the person overrides the team; a one-line options summary ("Up to 8 tasks", "Tasks finish in review"); a warning line when the reference does not resolve.
- 1440: the row fits; 1024: cards narrow, the options line truncates; under 640: the flow is a vertical list with down arrows and the "+" between items.
- Keyboard: arrows move between cards, Enter opens, number keys pick inside the panel, Esc closes and returns focus to the card.

### 5.3 The step panel

A right panel (about 440 px, full width on a phone) that keeps the flow visible.

1. Title (the step name), one line on what the step does, and the contract (section 1) in quiet text.
2. **Apply to**: [Everyone] [Just me]. With Just me, a line shows the team's value ("The team uses planning-issues") and the actions write my `library.toml`.
3. **Skill**: numbered choice cards (the Add work `ChoiceList` pattern), grouped: the built-in default, This workspace, each team library, Yours. A card shows the name, the first sentence of its "Use when", its source and "Not a valid skill: <first problem>" when it fails the `check-skills` rules. Picking a card saves.
4. **Options**: one two- or three-button row per option (3.3). Team-only options are disabled under Just me ("A team setting").
5. **Actions**: View skill (the Skills view on it); Edit (a workspace or personal skill) or Edit a copy (a built-in or a team library's skill); Reset to the team's choice (Just me with an override); Reset to built-in (Everyone, when changed).
6. Footer: "Saved to workflow.toml · Undo" (or "Saved to your library.toml · Undo") after each change.

Custom step panel: the same, with Label (prefilled, editable), Runs after (the step it follows, as buttons), Must pass [Yes] [No], and Remove step. The "+" opens it as a form with an Add step button; nothing is written until Add.

### 5.4 Edit a copy

1. "Where should the copy live?" [This workspace — the team uses it] [My library — only you]. Number keys.
2. "Name": prefilled `<workspace id prefix or handle>-<name>` (for example `wf-planning-issues`, `shruti-planning-issues`), accepted with Enter; must pass the name rules and be unique in that source.
3. The editor (`/settings/flow/edit`): the `SourceEditor` with a live check list (the `check-skills` rules) beside it, and Save. Saving writes the folder (`SKILL.md`; a copy of a built-in also copies its `scripts/` and `references/`), then points the step at the copy (team default for a workspace copy, my override for a library copy), then returns to the panel with the saved line.

A team library is read-only (libraries spec L6): its skills offer Edit a copy and Open on GitHub.

### 5.5 Agent tab

The round 2 Agent panel as a page: connection status, agent, host, repo, version, the skills check (now including the flow's skills, each with its install command), Switch agent, Disconnect. Until the merge it shows the connect button and a line that the agent connection arrives with round 2.

### 5.6 Workspace tab

Workspace name and id prefix (read-only, with "Open workflow.toml in Files"), leases [30] [60] [120] minutes, the lint rules turned off (read-only list). Context and staleness are under the Hand off and Status steps, not repeated here.

## 6. Writes in the prototype

- `workflow.toml`: through the existing file write (`writeWorkspaceFile`, with `base_rev`), using a new comment-preserving TOML editor (`setTomlKey`, `removeTomlKey`, `removeTomlTable`) that changes only the lines it must. The workspace reloads and the board, hints and Settings follow live.
- My `library.toml`: a new personal config read and write on the libraries layer (alias `me`, that one file only), with the same editor.
- New skill folders: workspace `skills/<name>/` through the file write; personal `skills/<name>/` through the personal library's page write (a `SKILL.md` is a markdown page).
- As everywhere in the prototype, browser edits live in memory and a reload starts from the files on disk; the real product writes through `wf serve` and the bridge (which commits the personal library).
- `wf:lint` checks `[flow]`: an unknown step or key, a bad option value, a custom step with a bad `after`, and a reference that does not resolve (warnings). The workspace's `skills/` folder is not an issue folder and is checked with the skill rules.

## 7. Distribution (goal 1)

- When the flow names a workspace, team or personal skill, every teammate's agent needs it installed. The Skills view's install panel shows `scripts/install-skills.sh --codex --from <workspace>/skills` (and the Claude Code form), and the step panel shows the same command under a skill that is not built in.
- The Agent tab's skills check lists the flow's skills that the connected agent lacks, with the install command.

## 8. Prototype content

- The Platform handbook team library fixture gets `skills/checking-security/SKILL.md` (a real, short skill that passes `check-skills`), so a custom "Security check" step after Do next step can be added by clicks.
- The shipped workspace's `workflow.toml` has no `[flow]` table (built-in flow). The sample's has none either; scripts and Kit frames set one when they need it.
- `window.__wf.setFlow(step, ref)` and `window.__wf.resetFlow()` for scripts.

## 9. Acceptance

1. `/settings/flow` shows the built-in flow; every card, chip and line is right at 1440, 1024 and 390, light and dark.
2. Plan → Edit a copy → This workspace → name accepted → edit one line → Save: `skills/wf-planning-issues/SKILL.md` exists, `workflow.toml` has `[flow.plan] skill = "ws:wf-planning-issues"` with every other line unchanged, the card says This workspace, and the plan hints, the context bundle's flow line and the Do next step run's Plan phase name the copy.
3. Just me on Do next step → Finish in review: my `library.toml` has `[flow.do] finish = "review"`; the card shows Your override; Team default view shows the team value; a Do next step run puts its task in review.
4. "+" after Do next step → Security check (Platform handbook) → Must pass → Add: the card appears; a run shows the Security check phase; the bundle lists it.
5. `wf-env.sh flow` prints the same resolution as the dashboard for the same files (shared fixture test), including an override, a custom step and an unresolved reference.
6. An agent eval: on a temporary copy of the sample with a swapped Plan skill and a required custom step, an agent that follows `using-wf` and `doing-next-step` uses the configured Plan skill and runs the custom step at its point.
7. Every write is one click and one confirmation; Undo restores the previous text exactly; keyboard and screen reader paths work.
